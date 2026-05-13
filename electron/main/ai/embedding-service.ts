import type { AppSettings } from './shared-types'
import { normalizeSettings } from './settings'

const MAX_BATCH_SIZE = 16
const EMBEDDING_MODEL_FALLBACKS = ['text-embedding-3-small', 'text-embedding-ada-002', 'embedding-2']

/**
 * Providers that don't expose OpenAI-compatible /embeddings 接口。
 * 这些 provider 直接跳过向量索引，只依赖关键词检索。
 */
const PROVIDERS_WITHOUT_EMBEDDINGS: ReadonlySet<string> = new Set(['anthropic'])

/**
 * 运行时观测到的 embedding 维度，按 `${provider}:${model}` 缓存。
 * 同一 (provider, model) 第二次调用返回不同维度时抛错，调用方捕获后静默降级。
 */
const observedDimensions = new Map<string, number>()

export class EmbeddingUnsupportedError extends Error {
  constructor(provider: string) {
    super(`当前 provider「${provider}」不支持 embedding 接口，向量检索已禁用。`)
    this.name = 'EmbeddingUnsupportedError'
  }
}

export class EmbeddingDimensionMismatchError extends Error {
  constructor(key: string, expected: number, actual: number) {
    super(`Embedding 维度不一致（${key}）：首次观测 ${expected}，本次返回 ${actual}。可能是切换了模型，请重建向量索引。`)
    this.name = 'EmbeddingDimensionMismatchError'
  }
}

export function providerSupportsEmbedding(settings: AppSettings): boolean {
  const provider = (settings.provider ?? '').trim().toLowerCase()
  if (!provider) return true
  return !PROVIDERS_WITHOUT_EMBEDDINGS.has(provider)
}

export function getObservedEmbeddingDimension(settings: AppSettings): number | null {
  const normalized = normalizeSettings(settings)
  return observedDimensions.get(`${normalized.provider}:${normalized.model}`) ?? null
}

export async function embedTexts(
  settings: AppSettings,
  texts: string[]
): Promise<Float32Array[]> {
  if (!texts.length) return []

  const normalized = normalizeSettings(settings)
  if (!providerSupportsEmbedding(normalized)) {
    throw new EmbeddingUnsupportedError(normalized.provider)
  }

  const baseUrl = (normalized.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const apiKey = normalized.apiKey
  const dimKey = `${normalized.provider}:${normalized.model}`

  const results: Float32Array[] = []
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE)
    const batchResults = await requestEmbeddings(baseUrl, apiKey, batch, normalized.model)
    if (batchResults.length) {
      const dim = batchResults[0].length
      const existing = observedDimensions.get(dimKey)
      if (existing == null) {
        observedDimensions.set(dimKey, dim)
      } else if (existing !== dim) {
        throw new EmbeddingDimensionMismatchError(dimKey, existing, dim)
      }
    }
    results.push(...batchResults)
  }
  return results
}

export async function embedText(settings: AppSettings, text: string): Promise<Float32Array> {
  const results = await embedTexts(settings, [text])
  return results[0]
}

async function requestEmbeddings(
  baseUrl: string,
  apiKey: string,
  inputs: string[],
  chatModel: string
): Promise<Float32Array[]> {
  const embeddingModel = resolveEmbeddingModel(chatModel)
  const url = `${baseUrl}/embeddings`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: embeddingModel,
      input: inputs,
      encoding_format: 'float'
    })
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`Embedding API error ${response.status}: ${errorText.slice(0, 200)}`)
  }

  const json = await response.json() as {
    data?: Array<{ embedding: number[]; index: number }>
  }

  if (!json.data?.length) {
    throw new Error('Embedding API returned empty data')
  }

  const sorted = json.data.sort((a, b) => a.index - b.index)
  return sorted.map((item) => {
    const vec = new Float32Array(item.embedding.length)
    for (let i = 0; i < item.embedding.length; i++) {
      vec[i] = item.embedding[i]
    }
    return vec
  })
}

function resolveEmbeddingModel(chatModel: string): string {
  const lower = chatModel.toLowerCase()
  if (lower.includes('deepseek')) return 'text-embedding-3-small'
  if (lower.includes('qwen')) return 'text-embedding-v3'
  if (lower.includes('glm') || lower.includes('zhipu')) return 'embedding-3'
  return EMBEDDING_MODEL_FALLBACKS[0]
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length)
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

export function splitTextIntoSegments(text: string, maxChars = 500): string[] {
  if (!text || text.length <= maxChars) return text ? [text] : []

  const paragraphs = text.split(/\n{2,}/)
  const segments: string[] = []
  let current = ''

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxChars && current) {
      segments.push(current.trim())
      current = ''
    }
    current += (current ? '\n\n' : '') + para
  }
  if (current.trim()) {
    segments.push(current.trim())
  }

  return segments.filter((s) => s.length >= 20)
}
