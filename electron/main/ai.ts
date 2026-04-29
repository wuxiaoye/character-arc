import { buildRepairPrompt, buildTaskPrompt } from './aiPrompts'
import {
  requestAiText,
  requestAiTextStream
} from './aiTransport'
import {
  normalizeSettings,
  validateSettings,
  type AiStreamHandlers,
  type AiTaskPayload,
  type AiTaskResult,
  type AppSettings,
  type ChapterAssistantResult,
  type CharacterResult,
  type OutlineResult,
  type ProjectBootstrapResult,
  type WorldviewResult
} from './aiShared'

export type { AiTaskPayload } from './aiShared'

function extractJsonObject(text: string): AiTaskResult {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)
  const raw = fenced?.[1] ?? text
  const firstBrace = raw.indexOf('{')
  const lastBrace = raw.lastIndexOf('}')
  const jsonSlice = firstBrace >= 0 && lastBrace >= 0 ? raw.slice(firstBrace, lastBrace + 1) : raw
  return JSON.parse(jsonSlice) as AiTaskResult
}

function isStructuredTask(task: AiTaskPayload): boolean {
  return task.task !== 'chapter-assistant'
}

function normalizeAssistantText(text: string): ChapterAssistantResult {
  const cleaned = text
    .replace(/```[\w-]*\n?/g, '')
    .replace(/```/g, '')
    .trim()

  return {
    content: cleaned
  }
}

function normalizeWorldviewResult(result: AiTaskResult): WorldviewResult {
  const entry = result as Partial<WorldviewResult>
  return {
    type: entry.type?.trim() || '地理',
    title: entry.title?.trim() || '新世界观词条',
    content: entry.content?.trim() || 'AI 未返回有效内容'
  }
}

function normalizeCharacterResult(result: AiTaskResult): CharacterResult {
  const character = result as Partial<CharacterResult>
  const tags = Array.isArray(character.tags)
    ? character.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 4)
    : []

  return {
    name: character.name?.trim() || '新角色',
    role: character.role?.trim() || '待设定',
    description: character.description?.trim() || 'AI 未返回有效角色描述',
    tags: tags.length ? tags : ['待完善']
  }
}

function normalizeOutlineResult(result: AiTaskResult): OutlineResult {
  const item = result as Partial<OutlineResult>
  return {
    title: item.title?.trim() || '第1章：新剧情节点',
    wordTarget: item.wordTarget?.trim() || '预估 3000字',
    conflict: item.conflict?.trim() || '新的冲突正在酝酿。',
    summary: item.summary?.trim() || 'AI 未返回有效剧情摘要'
  }
}

function normalizeProjectBootstrapResult(result: AiTaskResult): ProjectBootstrapResult {
  const payload = result as Partial<ProjectBootstrapResult>
  const worldviewEntries = Array.isArray(payload.worldviewEntries)
    ? payload.worldviewEntries.slice(0, 3).map((entry) => normalizeWorldviewResult(entry as AiTaskResult))
    : []
  const outlineItems = Array.isArray(payload.outlineItems)
    ? payload.outlineItems.slice(0, 3).map((item) => normalizeOutlineResult(item as AiTaskResult))
    : []

  return {
    worldviewEntries,
    outlineItems
  }
}

function isTaskResultUsable(task: AiTaskPayload, result: AiTaskResult): boolean {
  if (task.task === 'chapter-assistant') {
    return Boolean((result as ChapterAssistantResult).content?.trim())
  }

  if (task.task === 'project-bootstrap') {
    const payload = result as ProjectBootstrapResult
    return payload.worldviewEntries.length > 0 && payload.outlineItems.length > 0
  }

  if (task.task === 'worldview-entry') {
    const entry = result as WorldviewResult
    return Boolean(entry.title.trim() && entry.content.trim())
  }

  if (task.task === 'character-card') {
    const character = result as CharacterResult
    return Boolean(character.name.trim() && character.description.trim())
  }

  const outline = result as OutlineResult
  return Boolean(outline.title.trim() && outline.summary.trim())
}

function normalizeTaskResult(task: AiTaskPayload, rawText: string): AiTaskResult {
  if (task.task === 'chapter-assistant') {
    return normalizeAssistantText(rawText)
  }

  const parsed = extractJsonObject(rawText)

  switch (task.task) {
    case 'worldview-entry':
      return normalizeWorldviewResult(parsed)
    case 'character-card':
      return normalizeCharacterResult(parsed)
    case 'project-bootstrap':
      return normalizeProjectBootstrapResult(parsed)
    case 'outline-item':
    default:
      return normalizeOutlineResult(parsed)
  }
}

async function resolveTaskResult(task: AiTaskPayload, settings: AppSettings, rawText: string): Promise<AiTaskResult> {
  try {
    const normalized = normalizeTaskResult(task, rawText)
    if (isTaskResultUsable(task, normalized)) {
      return normalized
    }
  } catch {
    // Fall through to the repair pass below.
  }

  if (!isStructuredTask(task)) {
    return normalizeTaskResult(task, rawText)
  }

  const repairedText = await requestAiText(settings, buildRepairPrompt(task, rawText), task)
  const repairedResult = normalizeTaskResult(task, repairedText)

  if (!isTaskResultUsable(task, repairedResult)) {
    throw new Error('AI 返回的结构化结果不完整，请稍后重试或调整提示词。')
  }

  return repairedResult
}

export async function testAiConnection(rawSettings: AppSettings): Promise<{ provider: string; model: string }> {
  const settings = normalizeSettings(rawSettings)
  validateSettings(settings)

  const probePrompt = {
    system: 'You are a connectivity probe. Reply with CONNECTED only.',
    user: 'Return CONNECTED'
  }

  const text = await requestAiText(settings, probePrompt)

  if (!text.trim()) {
    throw new Error('模型连接成功，但没有返回可读内容。')
  }

  return {
    provider: settings.provider,
    model: settings.model
  }
}

export async function generateAiTask(task: AiTaskPayload): Promise<AiTaskResult> {
  const settings = normalizeSettings(task.settings)
  validateSettings(settings)
  const prompt = buildTaskPrompt(task)
  const rawText = await requestAiText(settings, prompt, task)
  return resolveTaskResult(task, settings, rawText)
}

export async function streamAiTask(
  task: AiTaskPayload,
  handlers: AiStreamHandlers,
  signal: AbortSignal
): Promise<ChapterAssistantResult> {
  if (task.task !== 'chapter-assistant') {
    throw new Error('当前流式输出仅支持章节创作助理。')
  }

  const settings = normalizeSettings(task.settings)
  validateSettings(settings)
  const prompt = buildTaskPrompt(task)
  const rawText = await requestAiTextStream(settings, prompt, handlers, signal, task)
  return normalizeAssistantText(rawText)
}
