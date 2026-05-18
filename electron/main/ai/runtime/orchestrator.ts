import type {
  AiTaskPayload,
  AiTaskKnowledgeContext,
  AiTaskResponse,
  AiTaskResult,
  AppSettings,
  AiStreamHandlers,
  ChapterStateWarningsPayload
} from '../shared-types'
import { normalizeSettings, validateSettings, resolveMaxTokens, AGENT_TASK_WHITELIST } from '../settings'
import { getTaskHandler } from '../tasks'
import { getAllSkills, pickSkillsFor, refreshRegistry } from '../skills'
import { aiGenerateText, aiStreamText } from '../generate'
import { providerSupportsTools } from '../provider'
import { buildPromptInput } from './context-builder'
import { buildRunMeta, buildResponsePreview } from './run-meta'
import { logPrompt, logResponse, logSelection, logError } from './logging'
import { buildRepairPrompt } from '../prompts/repair'
import { extractJsonObject } from '../tasks/base'
import { runAgentTask } from '../agent'
import { ensureWorkspaceDb } from '../../workspace-store'
import { buildStoryStateContext, formatStoryStateForPrompt, applyStateDelta } from '../../story-state-store'
import type { StateDelta } from '../../story-state-store'
import { indexChapterSegments, retrieveHybridContext, formatSemanticSegmentsForPrompt } from '../knowledge-retrieval'
import { runLightCheck } from '../audit/light-check'

/**
 * 执行一次完整的 AI 任务调用（非流式）。
 * 流程：校验设置 → 选择技能 → 混合检索 → 构建提示词 → 调用模型 → 校验/修复结果 → 触发后处理。
 * @param task - AI 任务载荷，包含任务类型、设置和上下文
 * @param knowledgeContext - 可选的知识检索上下文
 * @param signal - 可选的中止信号
 * @returns 任务执行结果与运行元数据
 */
export async function runAiTask(
  task: AiTaskPayload,
  knowledgeContext?: AiTaskKnowledgeContext,
  signal?: AbortSignal
): Promise<AiTaskResponse> {
  // 灰度分流：白名单内 + provider 支持 tool_use → 走 agent loop（progressive skill disclosure）。
  // 任意一个不满足 → 走原单次调用路径。renderer 完全无感。
  const settingsForRouting = normalizeSettings(task.settings)
  if (AGENT_TASK_WHITELIST.has(task.task)) {
    if (providerSupportsTools(settingsForRouting)) {
      return runAgentTask(task, knowledgeContext)
    }
    if (task.task === 'reference-deep-analyze') {
      throw new Error('深度拆书需要模型支持 tool_use（工具调用）。当前供应商不支持此功能，请切换到 DeepSeek、通义千问、OpenAI 或 Anthropic 等支持工具调用的供应商后重试。')
    }
  }

  const settings = settingsForRouting
  validateSettings(settings)
  const startedAt = new Date().toISOString()
  const projectId = String(task.context.projectId ?? '').trim()
  const clientKey = task.clientKey

  const handler = getTaskHandler(task.task)
  await refreshRegistry(projectId || undefined).catch(() => {})
  const skills = await pickSkillsFor(task, resolveEnabledSkillOverrides(task, projectId))
  const usedSkillIds = skills.map((s) => s.id)
  logSelection(task.task, skills, knowledgeContext?.usedKnowledge ?? [])

  // Phase 1: 为 chapter-first-draft / chapter-assistant / chapter-analysis / chapter-scene-plan
  // 走混合检索（状态块 + 向量语义段）；story-deep-audit 只需要状态块。
  if (projectId) {
    if (task.task === 'chapter-first-draft' || task.task === 'chapter-assistant' ||
        task.task === 'chapter-analysis' || task.task === 'chapter-scene-plan') {
      try {
        const hybrid = await retrieveHybridContext(task, settings)
        if (hybrid) {
          if (hybrid.storyStateBlock) task.context.storyStateBlock = hybrid.storyStateBlock
          const semanticBlock = formatSemanticSegmentsForPrompt(hybrid.semanticSegments)
          if (semanticBlock) task.context.semanticSegmentsBlock = semanticBlock
        }
      } catch { /* 混合检索失败不阻塞生成 */ }
    } else if (task.task === 'story-deep-audit') {
      try {
        const db = await ensureWorkspaceDb()
        const involvedCharIds = extractInvolvedCharacterIds(task.context)
        const storyState = buildStoryStateContext(db, projectId, involvedCharIds)
        const storyStateBlock = formatStoryStateForPrompt(storyState)
        if (storyStateBlock) task.context.storyStateBlock = storyStateBlock
      } catch { /* 状态库查询失败不阻塞生成 */ }
    }
  }

  const input = buildPromptInput(task, skills, knowledgeContext)
  const prompt = handler.buildPrompt(input)
  const maxTokens = handler.resolveMaxTokens?.(input) ?? resolveMaxTokens(task)

  logPrompt('REQUEST', settings, prompt, task.task, usedSkillIds)

  const requestStartedAt = Date.now()

  try {
    let rawText = await aiGenerateText(settings, prompt, maxTokens, signal)
    logResponse('REQUEST', settings, task.task, rawText, Date.now() - requestStartedAt, { usedSkills: usedSkillIds })
    let result: AiTaskResult
    let normalizeFailed = false
    try {
      result = handler.normalize(rawText)
    } catch {
      result = {} as AiTaskResult
      normalizeFailed = true
    }
    let repairTriggered = false

    // JSON 修复：最多重试 2 次，每次附上具体校验失败原因
    if (handler.outputType === 'json' && (normalizeFailed || !handler.validate(result))) {
      const MAX_REPAIR_ATTEMPTS = 2
      for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt += 1) {
        const validationErrors = (!normalizeFailed && handler.describeValidationErrors)
          ? handler.describeValidationErrors(result)
          : ['JSON 解析失败或结构不完整']
        const repairPromptPair = buildRepairPrompt(prompt.system, prompt.user, rawText, validationErrors)
        logPrompt(`REPAIR_${attempt}`, settings, repairPromptPair, task.task, usedSkillIds)
        const repairStartedAt = Date.now()
        rawText = await aiGenerateText(settings, repairPromptPair, maxTokens, signal)
        logResponse(`REPAIR_${attempt}`, settings, task.task, rawText, Date.now() - repairStartedAt, { usedSkills: usedSkillIds })
        normalizeFailed = false
        try {
          result = handler.normalize(rawText)
        } catch {
          result = {} as AiTaskResult
          normalizeFailed = true
        }
        repairTriggered = true

        if (!normalizeFailed && handler.validate(result)) {
          break
        }

        if (attempt === MAX_REPAIR_ATTEMPTS) {
          throw new Error('AI 返回的结构化结果经过 2 次修复仍不完整，请稍后重试或调整提示词。')
        }
      }
    }

    // 章节生成后：异步提取状态变更 + 建立向量索引（不阻塞返回）
    if (task.task === 'chapter-first-draft' && projectId && !normalizeFailed) {
      const finalContent = (result as { content?: string }).content ?? ''
      const chapterId = String(task.context.chapterId ?? '').trim()
      const chIdx = Number(task.context.chapterIndex ?? task.context.chapterSortOrder ?? 0)

      if (finalContent.length > 50) {
        runPostGenerationPipeline(settings, projectId, chIdx, chapterId, finalContent, task.context).catch(() => {})
      }
    }

    const finishedAt = new Date().toISOString()
    return {
      result,
      meta: buildRunMeta(
        task.task,
        projectId,
        String(task.context.chapterId ?? '').trim() || undefined,
        settings,
        'success',
        startedAt,
        finishedAt,
        knowledgeContext?.usedKnowledge ?? [],
        usedSkillIds,
        repairTriggered,
        buildResponsePreview(result),
        '',
        clientKey
      )
    }
  } catch (error) {
    const finishedAt = new Date().toISOString()
    const message = error instanceof Error ? error.message : 'AI 调用失败'
    logError('REQUEST', settings, task.task, error, Date.now() - requestStartedAt, { usedSkills: usedSkillIds })
    throw Object.assign(new Error(message), {
      aiRunMeta: buildRunMeta(
        task.task,
        projectId,
        String(task.context.chapterId ?? '').trim() || undefined,
        settings,
        'error',
        startedAt,
        finishedAt,
        knowledgeContext?.usedKnowledge ?? [],
        usedSkillIds,
        false,
        '',
        message,
        clientKey
      )
    })
  }
}

/**
 * 以流式方式执行 AI 任务，通过 handlers 回调逐步返回生成内容。
 * 仅支持 chapter-assistant 和 chapter-first-draft 两种任务。
 * @param task - AI 任务载荷
 * @param handlers - 流式输出回调（onChunk / onDone）
 * @param signal - 中止信号
 * @param knowledgeContext - 可选的知识检索上下文
 * @returns 任务执行结果与运行元数据
 */
export async function streamAiTask(
  task: AiTaskPayload,
  handlers: AiStreamHandlers,
  signal: AbortSignal,
  knowledgeContext?: AiTaskKnowledgeContext
): Promise<AiTaskResponse> {
  if (task.task !== 'chapter-assistant' && task.task !== 'chapter-first-draft') {
    throw new Error('当前流式输出仅支持章节创作助理和章节初稿生成。')
  }

  const settings = normalizeSettings(task.settings)
  validateSettings(settings)
  const startedAt = new Date().toISOString()
  const projectId = String(task.context.projectId ?? '').trim()
  const clientKey = task.clientKey

  const taskHandler = getTaskHandler(task.task)
  await refreshRegistry(projectId || undefined).catch(() => {})
  const skills = await pickSkillsFor(task, resolveEnabledSkillOverrides(task, projectId))
  const usedSkillIds = skills.map((s) => s.id)
  logSelection(task.task, skills, knowledgeContext?.usedKnowledge ?? [])

  // 流式路径也走混合检索（chapter-first-draft / chapter-assistant）
  if ((task.task === 'chapter-first-draft' || task.task === 'chapter-assistant') && projectId) {
    try {
      const hybrid = await retrieveHybridContext(task, settings)
      if (hybrid) {
        if (hybrid.storyStateBlock) task.context.storyStateBlock = hybrid.storyStateBlock
        const semanticBlock = formatSemanticSegmentsForPrompt(hybrid.semanticSegments)
        if (semanticBlock) task.context.semanticSegmentsBlock = semanticBlock
      }
    } catch { /* 混合检索失败不阻塞生成 */ }
  }

  const input = buildPromptInput(task, skills, knowledgeContext)
  const prompt = taskHandler.buildPrompt(input)
  const maxTokens = taskHandler.resolveMaxTokens?.(input) ?? resolveMaxTokens(task)

  logPrompt('STREAM', settings, prompt, task.task, usedSkillIds)
  const requestStartedAt = Date.now()

  try {
    const rawText = await aiStreamText(settings, prompt, handlers, signal, maxTokens)
    logResponse('STREAM', settings, task.task, rawText, Date.now() - requestStartedAt, { usedSkills: usedSkillIds })
    const result = taskHandler.normalize(rawText)
    const finishedAt = new Date().toISOString()
    const status = signal.aborted ? 'canceled' : 'success'

    // 流式生成完成后也触发异步后处理
    if (task.task === 'chapter-first-draft' && projectId && !signal.aborted) {
      const finalContent = (result as { content?: string }).content ?? ''
      const chapterId = String(task.context.chapterId ?? '').trim()
      const chIdx = Number(task.context.chapterIndex ?? task.context.chapterSortOrder ?? 0)
      if (finalContent.length > 50) {
        runPostGenerationPipeline(settings, projectId, chIdx, chapterId, finalContent, task.context).catch(() => {})
      }
    }

    return {
      result,
      meta: buildRunMeta(
        task.task,
        projectId,
        String(task.context.chapterId ?? '').trim() || undefined,
        settings,
        status,
        startedAt,
        finishedAt,
        knowledgeContext?.usedKnowledge ?? [],
        usedSkillIds,
        false,
        buildResponsePreview(result),
        '',
        clientKey
      )
    }
  } catch (error) {
    const finishedAt = new Date().toISOString()
    const status = signal.aborted ? 'canceled' : 'error'
    const message = signal.aborted ? '' : (error instanceof Error ? error.message : 'AI 流式调用失败')
    if (!signal.aborted) {
      logError('STREAM', settings, task.task, error, Date.now() - requestStartedAt, { usedSkills: usedSkillIds })
    }
    throw Object.assign(new Error(message || 'AI 流式调用失败'), {
      aiRunMeta: buildRunMeta(
        task.task,
        projectId,
        String(task.context.chapterId ?? '').trim() || undefined,
        settings,
        status,
        startedAt,
        finishedAt,
        knowledgeContext?.usedKnowledge ?? [],
        usedSkillIds,
        false,
        '',
        message,
        clientKey
      )
    })
  }
}

/**
 * 测试 AI 连接是否可用，发送一条简单探测提示并验证返回
 * @param rawSettings - 原始应用设置
 * @returns 成功时返回当前 provider 和 model 名称
 */
export async function testAiConnection(rawSettings: AppSettings): Promise<{ provider: string; model: string }> {
  const settings = normalizeSettings(rawSettings)
  validateSettings(settings)
  const probePrompt = {
    system: 'You are a connectivity probe. Reply with CONNECTED only.',
    user: 'Return CONNECTED'
  }
  logPrompt('TEST', settings, probePrompt, 'test-connection')
  const text = await aiGenerateText(settings, probePrompt)
  if (!text.trim()) {
    throw new Error('模型连接成功，但没有返回可读内容。')
  }
  return { provider: settings.provider, model: settings.model }
}

/** 根据任务上下文中的 projectSkills 构建技能启用/禁用映射表 */
function resolveEnabledSkillOverrides(
  task: AiTaskPayload,
  projectId: string
): Map<string, boolean> | undefined {
  if (!Array.isArray(task.context.projectSkills)) {
    return undefined
  }

  const enabledIds = new Set(
    task.context.projectSkills
      .map((skill) => {
        if (!skill || typeof skill !== 'object') {
          return ''
        }
        return String((skill as { id?: string }).id ?? '').trim()
      })
      .filter(Boolean)
  )

  const allSkills = getAllSkills(projectId || undefined)
  if (!allSkills.length) {
    return undefined
  }

  return new Map(allSkills.map((skill) => [skill.id, enabledIds.has(skill.id)]))
}

/** 从任务上下文中提取涉及的角色 ID 列表 */
function extractInvolvedCharacterIds(context: Record<string, unknown>): string[] {
  const ids: string[] = []
  const characters = context.characters
  if (Array.isArray(characters)) {
    for (const char of characters) {
      if (char && typeof char === 'object' && 'id' in char) {
        ids.push(String((char as { id: string }).id))
      }
    }
  }
  return ids
}

let chapterWarningsEmitter: ((payload: ChapterStateWarningsPayload) => void) | null = null

/**
 * IPC 层注入一个广播回调：章节轻检发现违规时，把告警推到前端。
 * 不注入时默默丢弃（只保留日志），避免测试/无 BrowserWindow 环境报错。
 */
export function setChapterWarningsEmitter(emit: (payload: ChapterStateWarningsPayload) => void): void {
  chapterWarningsEmitter = emit
}

/** 章节初稿生成后的异步后处理管线：提取状态变更 → 轻量审计 → 写入状态库 → 建立向量索引 */
async function runPostGenerationPipeline(
  settings: AppSettings,
  projectId: string,
  chapterIndex: number,
  chapterId: string,
  chapterContent: string,
  context: Record<string, unknown>
): Promise<void> {
  const db = await ensureWorkspaceDb()
  const involvedCharIds = extractInvolvedCharacterIds(context)
  const preState = buildStoryStateContext(db, projectId, involvedCharIds)

  const delta = await extractStateDeltaViaLLM(settings, chapterContent, preState)
  if (delta) {
    const checkResult = runLightCheck(chapterContent, preState, delta)
    if (!checkResult.passed) {
      logResponse('LIGHT_CHECK', settings, 'chapter-first-draft',
        checkResult.violations.map((v) => `[${v.severity}] ${v.message}`).join('\n'), 0, {})
      if (chapterWarningsEmitter && chapterId) {
        chapterWarningsEmitter({
          projectId,
          chapterId,
          chapterIndex,
          generatedAt: new Date().toISOString(),
          violations: checkResult.violations
        })
      }
    }
    applyStateDelta(db, projectId, chapterIndex, delta)
  }

  if (chapterId) {
    indexChapterSegments(settings, projectId, chapterIndex, chapterContent, chapterId).catch(() => {})
  }
}

/**
 * 调用 LLM 从章节正文中提取状态变更增量（角色、关系、伏笔、时间线）
 * @param settings - 应用设置
 * @param chapterContent - 章节正文内容
 * @param preState - 生成前的世界状态快照
 * @returns 提取到的状态变更增量，失败时返回 null
 */
export async function extractStateDeltaViaLLM(
  settings: AppSettings,
  chapterContent: string,
  preState: ReturnType<typeof buildStoryStateContext>
): Promise<StateDelta | null> {
  const stateSnapshot = formatStoryStateForPrompt(preState)
  const prompt = {
    system: `你是状态变更提取器。根据小说章节正文和当前世界状态，提取本章发生的所有状态变更。
只输出纯JSON，不要解释。JSON结构：
{
  "characters_updated": [{"character_id":"","changes":{"location":{"from":"","to":""},"physical_state":"","mental_state":"","arc_progression":"","power_level":"","inventory_delta":{"added":[],"removed":[]},"new_knowledge":[],"goals_update":{"completed":[],"added":[]}}}],
  "relationships_delta": [{"relationship_id":"","participants":["",""],"status_change":{"from":"","to":"","pivot_event":""},"new_tension_points":[]}],
  "foreshadowing_delta": {"planted":[{"id":"","type":"","description":"","method":""}],"advanced":[{"id":"","clue":"","method":""}],"resolved":[{"id":"","method":"","impact":""}]},
  "timeline": {"story_time_elapsed":"","current_story_date":"","events":[],"world_state_changes":[]}
}
只包含实际发生变更的字段，无变更的字段省略。角色ID使用角色名称。`,
    user: `当前世界状态：
${stateSnapshot || '（空）'}

本章正文：
${chapterContent}

请提取本章的状态变更JSON：`
  }

  try {
    const raw = await aiGenerateText(settings, prompt, 1500)
    const parsed = extractJsonObject(raw) as unknown as StateDelta
    if (!parsed.characters_updated) parsed.characters_updated = []
    if (!parsed.relationships_delta) parsed.relationships_delta = []
    if (!parsed.foreshadowing_delta) parsed.foreshadowing_delta = { planted: [], advanced: [], resolved: [] }
    if (!parsed.timeline) parsed.timeline = { story_time_elapsed: '', current_story_date: '', events: [] }
    return parsed
  } catch {
    return null
  }
}
