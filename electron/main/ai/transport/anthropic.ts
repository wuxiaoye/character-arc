import type { AppSettings, AiStreamHandlers, PromptPair } from '../shared-types'
import type {
  AgentMessage,
  AgentRequestParams,
  AgentResponse,
  AgentStopReason,
  AssistantContentBlock,
  ToolDefinition,
  ToolResultBlock
} from '../agent/tools/types'
import { performAiRequest, readErrorMessage } from './http'
import { consumeSseResponse, extractAnthropicDelta } from './sse'

export async function requestAnthropic(
  settings: AppSettings,
  prompt: PromptPair,
  maxTokens?: number,
  signal?: AbortSignal
): Promise<string> {
  const response = await performAiRequest(
    `${settings.baseUrl.replace(/\/$/, '')}/v1/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: settings.model,
        max_tokens: maxTokens ?? 600,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }]
      })
    },
    'Anthropic',
    signal
  )
  const data = (await response.json()) as { content?: Array<{ type?: string; text?: string }> }
  const content = data.content?.find((item) => item.type === 'text')?.text
  if (!content) throw new Error('Anthropic 返回内容为空')
  return content
}

export async function requestAnthropicStream(
  settings: AppSettings,
  prompt: PromptPair,
  handlers: AiStreamHandlers,
  signal: AbortSignal,
  maxTokens?: number
): Promise<string> {
  const timeoutCtl = new AbortController()
  const timeoutId = setTimeout(() => timeoutCtl.abort(), 180_000)
  const combinedSignal = AbortSignal.any([signal, timeoutCtl.signal])

  try {
    const response = await fetch(
      `${settings.baseUrl.replace(/\/$/, '')}/v1/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.apiKey,
          'anthropic-version': '2023-06-01'
        },
        signal: combinedSignal,
        body: JSON.stringify({
          model: settings.model,
          stream: true,
          max_tokens: maxTokens ?? 600,
          system: prompt.system,
          messages: [{ role: 'user', content: prompt.user }]
        })
      }
    )
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, 'Anthropic'))
    }
    let content = ''
    await consumeSseResponse(response, (eventName, data) => {
      if (!data) return
      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(data) as Record<string, unknown>
      } catch {
        return
      }
      const delta = extractAnthropicDelta(eventName, payload)
      if (!delta) return
      content += delta
      handlers.onTextDelta(delta)
    })
    return content
  } finally {
    clearTimeout(timeoutId)
  }
}

// ---------------------------------------------------------------------------
// Tool-aware (agentic) request — non-streaming.
// Translates AgentMessage[] / ToolDefinition[] to Anthropic Messages API and
// translates the response back into provider-neutral content blocks.
// ---------------------------------------------------------------------------

export async function requestAnthropicWithTools(
  settings: AppSettings,
  params: AgentRequestParams,
  signal?: AbortSignal
): Promise<AgentResponse> {
  const body = {
    model: settings.model,
    max_tokens: params.maxTokens ?? 1024,
    system: params.system,
    tools: params.tools.map(toAnthropicTool),
    messages: params.messages.map(toAnthropicMessage)
  }

  const response = await performAiRequest(
    `${settings.baseUrl.replace(/\/$/, '')}/v1/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    },
    'Anthropic',
    signal
  )

  const data = (await response.json()) as {
    stop_reason?: string
    content?: Array<Record<string, unknown>>
  }

  return {
    stopReason: mapAnthropicStopReason(data.stop_reason),
    contentBlocks: (data.content ?? [])
      .map(fromAnthropicContentBlock)
      .filter((b): b is AssistantContentBlock => b !== null)
  }
}

function toAnthropicTool(tool: ToolDefinition): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema
  }
}

function toAnthropicMessage(message: AgentMessage): Record<string, unknown> {
  if (message.role === 'user') {
    if (typeof message.content === 'string') {
      return { role: 'user', content: message.content }
    }
    return {
      role: 'user',
      content: message.content.map((block: ToolResultBlock) => ({
        type: 'tool_result',
        tool_use_id: block.toolUseId,
        content: block.content,
        ...(block.isError ? { is_error: true } : {})
      }))
    }
  }
  return {
    role: 'assistant',
    content: message.content
      .filter((block) => block.type !== 'reasoning')
      .map((block) =>
        block.type === 'text'
          ? { type: 'text', text: block.text }
          : { type: 'tool_use', id: (block as { id: string }).id, name: (block as { name: string }).name, input: (block as { input: Record<string, unknown> }).input }
      )
  }
}

function fromAnthropicContentBlock(block: Record<string, unknown>): AssistantContentBlock | null {
  const type = String(block.type ?? '')
  if (type === 'text' && typeof block.text === 'string') {
    return { type: 'text', text: block.text }
  }
  if (type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') {
    const input = (block.input ?? {}) as Record<string, unknown>
    return { type: 'tool_use', id: block.id, name: block.name, input }
  }
  return null
}

function mapAnthropicStopReason(reason: string | undefined): AgentStopReason {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'end_turn'
    case 'tool_use':
      return 'tool_use'
    case 'max_tokens':
      return 'max_tokens'
    default:
      return 'other'
  }
}
