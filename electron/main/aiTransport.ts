import type { AiStreamHandlers, AiTaskPayload, AppSettings, PromptPair } from './aiShared'
import { AI_REQUEST_TIMEOUT_MS, resolveMaxTokens } from './aiShared'

async function readErrorMessage(response: Response, fallbackLabel: string): Promise<string> {
  const fallback = `${fallbackLabel} 请求失败：${response.status} ${response.statusText}`

  try {
    const data = (await response.json()) as Record<string, unknown>
    const error = (data.error ?? data) as Record<string, unknown>
    const message =
      (typeof error.message === 'string' && error.message) ||
      (typeof error.error === 'string' && error.error) ||
      (typeof data.message === 'string' && data.message)

    return message ? `${fallbackLabel} 请求失败：${message}` : fallback
  } catch {
    return fallback
  }
}

async function performAiRequest(url: string, init: RequestInit, providerLabel: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal
    })

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, providerLabel))
    }

    return response
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${providerLabel} 请求超时，请检查网络、代理或模型服务状态。`)
    }

    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function requestOpenAiCompatible(
  settings: AppSettings,
  prompt: PromptPair,
  task?: AiTaskPayload
): Promise<string> {
  const response = await performAiRequest(`${settings.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {})
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.8,
      ...(resolveMaxTokens(task) ? { max_tokens: resolveMaxTokens(task) } : {}),
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user }
      ]
    })
  }, 'OpenAI 兼容接口')

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }

  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('AI 返回内容为空')
  }

  return content
}

async function requestAnthropic(settings: AppSettings, prompt: PromptPair, task?: AiTaskPayload): Promise<string> {
  const response = await performAiRequest(`${settings.baseUrl.replace(/\/$/, '')}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: resolveMaxTokens(task) ?? 600,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }]
    })
  }, 'Anthropic')

  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>
  }

  const content = data.content?.find((item) => item.type === 'text')?.text
  if (!content) {
    throw new Error('Anthropic 返回内容为空')
  }

  return content
}

function extractOpenAiCompatibleDelta(payload: Record<string, unknown>): string {
  const choice = Array.isArray(payload.choices) ? (payload.choices[0] as Record<string, unknown> | undefined) : undefined
  const delta = choice?.delta as Record<string, unknown> | string[] | string | undefined

  if (typeof (delta as Record<string, unknown> | undefined)?.content === 'string') {
    return String((delta as Record<string, unknown>).content)
  }

  const contentParts = (delta as Record<string, unknown> | undefined)?.content
  if (Array.isArray(contentParts)) {
    return contentParts
      .map((part) => {
        const record = part as Record<string, unknown>
        if (typeof record.text === 'string') {
          return record.text
        }

        return typeof record.content === 'string' ? record.content : ''
      })
      .join('')
  }

  return ''
}

function extractAnthropicDelta(eventName: string, payload: Record<string, unknown>): string {
  const payloadType = String(payload.type ?? '')
  if (eventName === 'content_block_delta' || payloadType === 'content_block_delta') {
    const delta = payload.delta as Record<string, unknown> | undefined
    return typeof delta?.text === 'string' ? delta.text : ''
  }

  return ''
}

async function consumeSseResponse(
  response: Response,
  onEvent: (eventName: string, data: string) => void | Promise<void>
): Promise<void> {
  if (!response.body) {
    throw new Error('模型响应不支持流式读取。')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })

    let separatorIndex = buffer.indexOf('\n\n')
    while (separatorIndex >= 0) {
      const rawEvent = buffer.slice(0, separatorIndex).trim()
      buffer = buffer.slice(separatorIndex + 2)

      if (rawEvent) {
        let eventName = 'message'
        const dataLines: string[] = []

        for (const line of rawEvent.split(/\r?\n/)) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim() || eventName
            continue
          }

          if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart())
          }
        }

        await onEvent(eventName, dataLines.join('\n'))
      }

      separatorIndex = buffer.indexOf('\n\n')
    }

    if (done) {
      const trailingEvent = buffer.trim()
      if (trailingEvent) {
        let eventName = 'message'
        const dataLines: string[] = []

        for (const line of trailingEvent.split(/\r?\n/)) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim() || eventName
            continue
          }

          if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart())
          }
        }

        await onEvent(eventName, dataLines.join('\n'))
      }

      break
    }
  }
}

async function requestOpenAiCompatibleStream(
  settings: AppSettings,
  prompt: PromptPair,
  handlers: AiStreamHandlers,
  signal: AbortSignal,
  task?: AiTaskPayload
): Promise<string> {
  const response = await fetch(`${settings.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {})
    },
    signal,
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.8,
      stream: true,
      ...(resolveMaxTokens(task) ? { max_tokens: resolveMaxTokens(task) } : {}),
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user }
      ]
    })
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'OpenAI 兼容接口'))
  }

  let content = ''
  await consumeSseResponse(response, (_eventName, data) => {
    if (!data || data === '[DONE]') {
      return
    }

    const payload = JSON.parse(data) as Record<string, unknown>
    const delta = extractOpenAiCompatibleDelta(payload)
    if (!delta) {
      return
    }

    content += delta
    handlers.onTextDelta(delta)
  })

  return content
}

async function requestAnthropicStream(
  settings: AppSettings,
  prompt: PromptPair,
  handlers: AiStreamHandlers,
  signal: AbortSignal,
  task?: AiTaskPayload
): Promise<string> {
  const response = await fetch(`${settings.baseUrl.replace(/\/$/, '')}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01'
    },
    signal,
    body: JSON.stringify({
      model: settings.model,
      stream: true,
      max_tokens: resolveMaxTokens(task) ?? 600,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }]
    })
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Anthropic'))
  }

  let content = ''
  await consumeSseResponse(response, (eventName, data) => {
    if (!data) {
      return
    }

    const payload = JSON.parse(data) as Record<string, unknown>
    const delta = extractAnthropicDelta(eventName, payload)
    if (!delta) {
      return
    }

    content += delta
    handlers.onTextDelta(delta)
  })

  return content
}

export async function requestAiText(settings: AppSettings, prompt: PromptPair, task?: AiTaskPayload): Promise<string> {
  return settings.provider === 'anthropic'
    ? requestAnthropic(settings, prompt, task)
    : requestOpenAiCompatible(settings, prompt, task)
}

export async function requestAiTextStream(
  settings: AppSettings,
  prompt: PromptPair,
  handlers: AiStreamHandlers,
  signal: AbortSignal,
  task?: AiTaskPayload
): Promise<string> {
  return settings.provider === 'anthropic'
    ? requestAnthropicStream(settings, prompt, handlers, signal, task)
    : requestOpenAiCompatibleStream(settings, prompt, handlers, signal, task)
}
