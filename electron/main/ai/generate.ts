import { generateText, streamText } from 'ai'
import { createModel } from './provider'
import type { AppSettings, AiStreamHandlers, PromptPair } from './shared-types'

export async function aiGenerateText(
  settings: AppSettings,
  prompt: PromptPair,
  maxTokens?: number,
  signal?: AbortSignal
): Promise<string> {
  const result = await generateText({
    model: createModel(settings),
    system: prompt.system,
    prompt: prompt.user,
    maxOutputTokens: maxTokens,
    abortSignal: signal
  })
  return result.text
}

export async function aiStreamText(
  settings: AppSettings,
  prompt: PromptPair,
  handlers: AiStreamHandlers,
  signal: AbortSignal,
  maxTokens?: number
): Promise<string> {
  const result = streamText({
    model: createModel(settings),
    system: prompt.system,
    prompt: prompt.user,
    maxOutputTokens: maxTokens,
    abortSignal: signal
  })
  let full = ''
  for await (const chunk of result.textStream) {
    full += chunk
    handlers.onTextDelta(chunk)
  }
  return full
}
