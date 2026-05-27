import type { AppSettings } from '../shared-types'
import { performAiRequest } from './http'

/** 图片生成接口的返回结果 */
export type GeneratedImageResult = {
  dataUrl: string
  revisedPrompt?: string
}

/** 将图片生成相关的配置项（imageModel、imageApiKey、imageBaseUrl）提取到通用字段中 */
function normalizeImageSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    model: settings.imageModel?.trim() || '',
    apiKey: settings.imageApiKey?.trim() || '',
    baseUrl: settings.imageBaseUrl?.trim() || ''
  }
}

/** 根据 base64 数据的头部特征推断图片 MIME 类型 */
function inferMimeType(base64: string): string {
  if (base64.startsWith('/9j/')) {
    return 'image/jpeg'
  }

  if (base64.startsWith('UklGR')) {
    return 'image/webp'
  }

  return 'image/png'
}

/**
 * 调用 OpenAI 兼容的图片生成接口，返回 data URL 格式的图片。
 *
 * @param settings - 应用配置（需包含 imageModel、imageBaseUrl、imageApiKey）
 * @param prompt - 图片生成提示词
 * @returns 包含 dataUrl 和可选 revisedPrompt 的结果
 */
export async function generateImage(settings: AppSettings, prompt: string): Promise<GeneratedImageResult> {
  const normalized = normalizeImageSettings(settings)
  if (!normalized.model.trim()) {
    throw new Error('请先在设置中填写专用的图片生成模型（不会自动回退到文本模型）。')
  }
  if (!normalized.baseUrl.trim()) {
    throw new Error('请先在设置中填写专用的图片生成 Base URL。')
  }
  if (!normalized.apiKey.trim()) {
    throw new Error('请先在设置中填写专用的图片生成 API Key。')
  }

  const response = await performAiRequest({
    url: `${normalized.baseUrl.replace(/\/$/, '')}/images/generations`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${normalized.apiKey}`
      },
      body: JSON.stringify({
        model: normalized.model,
        prompt,
        size: '1024x1536',
        response_format: 'b64_json'
      })
    },
    providerLabel: '图片生成接口',
    timeoutMs: settings.aiTimeoutSeconds ? settings.aiTimeoutSeconds * 1000 : undefined
  })

  const data = (await response.json()) as {
    data?: Array<{
      b64_json?: string
      revised_prompt?: string
      url?: string
    }>
  }
  const first = data.data?.[0]
  if (!first) {
    throw new Error('图片生成成功，但没有返回图片数据。')
  }

  if (first.b64_json?.trim()) {
    const base64 = first.b64_json.trim()
    return {
      dataUrl: `data:${inferMimeType(base64)};base64,${base64}`,
      revisedPrompt: first.revised_prompt?.trim() || undefined
    }
  }

  if (first.url?.trim()) {
    return {
      dataUrl: first.url.trim(),
      revisedPrompt: first.revised_prompt?.trim() || undefined
    }
  }

  throw new Error('图片生成成功，但返回结果中没有可用图片。')
}
