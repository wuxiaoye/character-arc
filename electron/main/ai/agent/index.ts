import type {
  AiAgentStreamHandlers,
  AiKnowledgeDocumentDraft,
  AiTaskKnowledgeContext,
  AiTaskPayload,
  AiTaskResponse
} from '../shared-types'
import { normalizeSettings, validateSettings, resolveMaxTokens } from '../settings'
import { getTaskHandler } from '../tasks'
import { getEnabledSkills, getSkillById, pickSkillsFor, refreshRegistry } from '../skills'
import { aiGenerateText } from '../generate'
import { buildPromptInput } from '../runtime/context-builder'
import { buildRunMeta, buildResponsePreview } from '../runtime/run-meta'
import { logPrompt, logResponse, logSelection, logError } from '../runtime/logging'
import { buildRepairPrompt } from '../prompts/repair'
import { runAgent } from './run-agent'
import { createSkillTools } from './tools/skill-tools'
import { createKnowledgeTools } from './tools/knowledge-tools'
import { buildAgentBehaviorRules, buildSkillIndex } from './system-prompt'

function stripSkillFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  if (!match) return content
  return content.slice(match[0].length)
}

const NOOP_AGENT_HANDLERS: AiAgentStreamHandlers = {
  onTextDelta: () => {},
  onToolUseStart: () => {},
  onToolResult: () => {},
  onAgentStatus: () => {},
  onEditApplied: () => {}
}

export async function runAgentTask(
  task: AiTaskPayload,
  knowledgeContext?: AiTaskKnowledgeContext
): Promise<AiTaskResponse> {
  const settings = normalizeSettings(task.settings)
  validateSettings(settings)
  const startedAt = new Date().toISOString()
  const projectId = String(task.context.projectId ?? '').trim()
  const chapterId = String(task.context.chapterId ?? '').trim() || undefined

  const handler = getTaskHandler(task.task)
  await refreshRegistry(projectId || undefined).catch(() => {})

  const candidateSkills = await pickSkillsFor(task, resolveEnabledSkillOverrides(task, projectId))
  const usedSkillIds = candidateSkills.map((s) => s.id)
  logSelection(task.task, candidateSkills, knowledgeContext?.usedKnowledge ?? [])

  const input = buildPromptInput(task, candidateSkills, knowledgeContext)
  const prompt = handler.buildPrompt(input)
  const maxTokens = handler.resolveMaxTokens?.(input) ?? resolveMaxTokens(task)

  const candidateSkillDefs = candidateSkills
    .map((sel) => getSkillById(sel.id, projectId || undefined))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))

  const requiredSkillDefs = candidateSkillDefs.filter((s) => s.manifest.required)
  const optionalSkillDefs = candidateSkillDefs.filter((s) => !s.manifest.required)

  const requiredSkillBlock = requiredSkillDefs.length
    ? `\n\n## 强制生效的 SKILLS（已直接注入，无需调用 skill_load）\n\n${requiredSkillDefs.map((s) => {
        const body = stripSkillFrontmatter(s.content).trim().slice(0, 2000)
        return `### ${s.name}\n${body}`
      }).join('\n\n')}`
    : ''

  const systemPrompt = `${prompt.system}${requiredSkillBlock}\n${buildSkillIndex(optionalSkillDefs)}\n${buildAgentBehaviorRules()}`

  const skillTools = createSkillTools({
    resolveSkill: (id) => getSkillById(id, projectId || undefined),
    allowScriptExecution: (skill) => skill.scope === 'builtin'
  })

  const producedKnowledgeDocuments: AiKnowledgeDocumentDraft[] = []
  const referenceTitle = String(task.context.referenceTitle ?? task.context.sourceTitle ?? '').trim()
  const knowledgeTools = createKnowledgeTools({
    collectDocument: (doc) => producedKnowledgeDocuments.push(doc),
    defaultSourceLabel: referenceTitle || 'agent'
  })

  const tools = [...skillTools, ...knowledgeTools]
  const controller = new AbortController()

  logPrompt('AGENT_REQUEST', settings, { system: systemPrompt, user: prompt.user }, task.task, usedSkillIds)
  const requestStartedAt = Date.now()

  try {
    const loopResult = await runAgent({
      settings,
      systemPrompt,
      userPrompt: prompt.user,
      tools,
      ctx: { signal: controller.signal, projectId },
      handlers: NOOP_AGENT_HANDLERS,
      maxTokens
    })
    logResponse('AGENT_REQUEST', settings, task.task, loopResult.finalText, Date.now() - requestStartedAt, { usedSkills: usedSkillIds })

    let rawText = loopResult.finalText
    let result = handler.normalize(rawText)
    let repairTriggered = false

    if (handler.outputType === 'json' && !handler.validate(result)) {
      const repairPromptPair = buildRepairPrompt(prompt.system, prompt.user, rawText)
      logPrompt('AGENT_REPAIR', settings, repairPromptPair, task.task, usedSkillIds)
      const repairStartedAt = Date.now()
      rawText = await aiGenerateText(settings, repairPromptPair, maxTokens)
      logResponse('AGENT_REPAIR', settings, task.task, rawText, Date.now() - repairStartedAt, { usedSkills: usedSkillIds })
      result = handler.normalize(rawText)
      repairTriggered = true

      if (!handler.validate(result)) {
        throw new Error('AI 返回的结构化结果不完整，请稍后重试或调整提示词。')
      }
    }

    const finishedAt = new Date().toISOString()
    const meta = buildRunMeta(
      task.task, projectId, chapterId, settings, 'success',
      startedAt, finishedAt,
      knowledgeContext?.usedKnowledge ?? [], usedSkillIds,
      repairTriggered, buildResponsePreview(result), ''
    )
    meta.toolCalls = loopResult.toolCalls
    meta.agentIterations = loopResult.iterations
    if (producedKnowledgeDocuments.length > 0) {
      meta.producedKnowledgeDocuments = producedKnowledgeDocuments
    }

    return { result, meta }
  } catch (error) {
    const finishedAt = new Date().toISOString()
    const message = error instanceof Error ? error.message : 'AI 调用失败'
    logError('AGENT_REQUEST', settings, task.task, error, Date.now() - requestStartedAt, { usedSkills: usedSkillIds })
    const meta = buildRunMeta(
      task.task, projectId, chapterId, settings, 'error',
      startedAt, finishedAt,
      knowledgeContext?.usedKnowledge ?? [], usedSkillIds,
      false, '', message
    )
    throw Object.assign(new Error(message), { aiRunMeta: meta })
  }
}

function resolveEnabledSkillOverrides(
  task: AiTaskPayload,
  projectId: string
): Map<string, boolean> | undefined {
  if (!Array.isArray(task.context.projectSkills)) return undefined

  const enabledIds = new Set(
    task.context.projectSkills
      .map((skill) => {
        if (!skill || typeof skill !== 'object') return ''
        return String((skill as { id?: string }).id ?? '').trim()
      })
      .filter(Boolean)
  )

  const allSkills = getEnabledSkills(projectId || undefined)
  if (!allSkills.length) return undefined

  return new Map(allSkills.map((skill) => [skill.id, enabledIds.has(skill.id)]))
}
