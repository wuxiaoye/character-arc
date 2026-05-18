import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'
import type { AppSettings } from './shared-types'

export function createModel(settings: AppSettings): LanguageModel {
  if (settings.provider === 'anthropic') {
    const anthropic = createAnthropic({
      apiKey: settings.apiKey,
      baseURL: settings.baseUrl || undefined
    })
    return anthropic(settings.model)
  }

  const openai = createOpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl
  })
  return openai(settings.model)
}

export function providerSupportsTools(settings: AppSettings): boolean {
  if (settings.provider === 'anthropic') return true
  if (settings.provider === 'ollama') return false
  return true
}
