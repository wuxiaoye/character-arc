export type ProviderName = 'openai' | 'deepseek' | 'anthropic' | 'ollama' | string

export type AppSettings = {
  provider: string
  model: string
  apiKey: string
  baseUrl: string
}

export type AiTaskName = 'worldview-entry' | 'character-card' | 'outline-item' | 'chapter-assistant' | 'project-bootstrap'

export type AiTaskPayload = {
  task: AiTaskName
  settings: AppSettings
  context: Record<string, unknown>
}

export type WorldviewResult = {
  type: string
  title: string
  content: string
}

export type CharacterResult = {
  name: string
  role: string
  description: string
  tags: string[]
}

export type OutlineResult = {
  title: string
  wordTarget: string
  conflict: string
  summary: string
}

export type ChapterAssistantResult = {
  content: string
}

export type ProjectBootstrapResult = {
  worldviewEntries: WorldviewResult[]
  outlineItems: OutlineResult[]
}

export type AiTaskResult =
  | WorldviewResult
  | CharacterResult
  | OutlineResult
  | ChapterAssistantResult
  | ProjectBootstrapResult

export type PromptPair = {
  system: string
  user: string
}

export type AiStreamHandlers = {
  onTextDelta: (delta: string) => void
}

export const AI_REQUEST_TIMEOUT_MS = 60_000

export function resolveProviderDefaults(provider: ProviderName): { baseUrl: string; model: string } {
  switch (provider) {
    case 'openai':
      return { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }
    case 'deepseek':
      return { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' }
    case 'qwen':
      return { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' }
    case 'zhipu':
      return { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.7' }
    case 'moonshot':
      return { baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k2.5' }
    case 'siliconflow':
      return { baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-72B-Instruct' }
    case 'anthropic':
      return { baseUrl: 'https://api.anthropic.com', model: 'claude-3-5-sonnet-latest' }
    case 'ollama':
      return { baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama3.2' }
    case 'new-api':
    case 'one-api':
      return { baseUrl: 'http://127.0.0.1:3000/v1', model: 'qwen-plus' }
    default:
      return { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }
  }
}

export function normalizeSettings(settings: AppSettings): AppSettings {
  const provider = settings.provider?.trim().toLowerCase() || 'deepseek'
  const defaults = resolveProviderDefaults(provider)
  return {
    provider,
    model: settings.model?.trim() || defaults.model,
    apiKey: settings.apiKey?.trim() || '',
    baseUrl: settings.baseUrl?.trim() || defaults.baseUrl
  }
}

export function isLocalBaseUrl(baseUrl: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(baseUrl.trim())
}

export function requiresApiKey(settings: AppSettings): boolean {
  if (settings.provider === 'ollama') {
    return false
  }

  return !isLocalBaseUrl(settings.baseUrl)
}

export function validateSettings(settings: AppSettings): void {
  if (!settings.model.trim()) {
    throw new Error('请先填写模型名称。')
  }

  if (!settings.baseUrl.trim()) {
    throw new Error('请先填写 Base URL。')
  }

  if (requiresApiKey(settings) && !settings.apiKey.trim()) {
    throw new Error('当前模型供应商需要 API Key，请先在设置页填写。')
  }
}

export function resolveMaxTokens(task?: AiTaskPayload): number | undefined {
  switch (task?.task) {
    case 'project-bootstrap':
      return 1500
    case 'chapter-assistant':
      switch (String(task.context.responseLength ?? 'medium')) {
        case 'short':
          return 500
        case 'long':
          return 1400
        default:
          return 900
      }
    case 'worldview-entry':
    case 'character-card':
    case 'outline-item':
      return 700
    default:
      return undefined
  }
}
