import type { DatabaseSync } from 'node:sqlite'
import type { AppSettings, AiTaskPayload } from './shared-types'
import type { StoryStateContext } from '../story-state-store'
import { buildStoryStateContext, formatStoryStateForPrompt } from '../story-state-store'
import { embedText, cosineSimilarity } from './embedding-service'
import { ensureWorkspaceDb } from '../workspace-store'

export interface HybridRetrievalResult {
  storyStateBlock: string
  semanticSegments: Array<{ text: string; score: number; sourceType: string; chapterIndex?: number }>
}

const SEMANTIC_TOP_K = 8
const SEMANTIC_MIN_SCORE = 0.68
const RETRIEVAL_TASKS = new Set([
  'chapter-first-draft',
  'chapter-assistant',
  'chapter-analysis',
  'chapter-scene-plan'
])

export async function retrieveHybridContext(
  task: AiTaskPayload,
  settings: AppSettings
): Promise<HybridRetrievalResult | null> {
  if (!RETRIEVAL_TASKS.has(task.task)) return null

  const projectId = String(task.context.projectId ?? '').trim()
  if (!projectId) return null

  let db: DatabaseSync
  try {
    db = await ensureWorkspaceDb()
  } catch {
    return null
  }

  const involvedCharIds = extractCharacterIds(task.context)
  const storyState = buildStoryStateContext(db, projectId, involvedCharIds)
  const storyStateBlock = formatStoryStateForPrompt(storyState)

  let semanticSegments: HybridRetrievalResult['semanticSegments'] = []
  try {
    semanticSegments = await retrieveSemanticSegments(db, projectId, task, settings)
  } catch {
    // embedding API failure is non-blocking
  }

  return { storyStateBlock, semanticSegments }
}

async function retrieveSemanticSegments(
  db: DatabaseSync,
  projectId: string,
  task: AiTaskPayload,
  settings: AppSettings
): Promise<HybridRetrievalResult['semanticSegments']> {
  const queryText = buildSemanticQuery(task.context)
  if (!queryText || queryText.length < 10) return []

  const hasEmbeddings = db.prepare(
    `SELECT COUNT(*) as cnt FROM story_embeddings WHERE project_id = ?`
  ).get(projectId) as { cnt: number } | undefined

  if (!hasEmbeddings?.cnt) return []

  const queryEmbedding = await embedText(settings, queryText)

  const rows = db.prepare(`
    SELECT id, source_type, chapter_index, text_content, embedding
    FROM story_embeddings
    WHERE project_id = ?
    ORDER BY created_at DESC
    LIMIT 200
  `).all(projectId) as Array<{
    id: string
    source_type: string
    chapter_index: number | null
    text_content: string
    embedding: Buffer
  }>

  const scored = rows
    .map((row) => {
      const storedVec = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4)
      const score = cosineSimilarity(queryEmbedding, storedVec)
      return {
        text: row.text_content,
        score,
        sourceType: row.source_type,
        chapterIndex: row.chapter_index ?? undefined
      }
    })
    .filter((item) => item.score >= SEMANTIC_MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, SEMANTIC_TOP_K)

  return scored
}

function buildSemanticQuery(context: Record<string, unknown>): string {
  const parts: string[] = []
  if (context.chapterTitle) parts.push(String(context.chapterTitle))
  if (context.chapterSummary) parts.push(String(context.chapterSummary))
  if (context.userPrompt) parts.push(String(context.userPrompt).slice(0, 200))
  if (context.sceneFocus) parts.push(String(context.sceneFocus))
  return parts.join(' ').trim()
}

function extractCharacterIds(context: Record<string, unknown>): string[] {
  const characters = context.characters
  if (!Array.isArray(characters)) return []
  return characters
    .filter((c) => c && typeof c === 'object' && 'id' in c)
    .map((c) => String((c as { id: string }).id))
}

export function formatSemanticSegmentsForPrompt(
  segments: HybridRetrievalResult['semanticSegments']
): string {
  if (!segments.length) return ''
  const lines = segments.map((seg) => {
    const chLabel = seg.chapterIndex != null ? `第${seg.chapterIndex}章` : ''
    return `[${seg.sourceType}${chLabel ? '/' + chLabel : ''}] ${seg.text.slice(0, 400)}`
  })
  return `### 语义检索相关片段\n${lines.join('\n\n')}`
}

export async function indexChapterSegments(
  settings: AppSettings,
  projectId: string,
  chapterIndex: number,
  chapterContent: string,
  chapterId: string
): Promise<void> {
  if (!chapterContent || chapterContent.length < 50) return

  const db = await ensureWorkspaceDb()

  db.prepare(
    `DELETE FROM story_embeddings WHERE project_id = ? AND source_id = ?`
  ).run(projectId, chapterId)

  const segments = splitForEmbedding(chapterContent)
  if (!segments.length) return

  let embeddings: Float32Array[]
  try {
    const { embedTexts } = await import('./embedding-service')
    embeddings = await embedTexts(settings, segments)
  } catch {
    return
  }

  const stmt = db.prepare(`
    INSERT INTO story_embeddings (id, project_id, source_type, source_id, chapter_index, text_content, embedding, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const timestamp = new Date().toISOString()
  for (let i = 0; i < segments.length; i++) {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const buffer = Buffer.from(embeddings[i].buffer)
    stmt.run(id, projectId, 'chapter_segment', chapterId, chapterIndex, segments[i], buffer, timestamp)
  }
}

export async function indexReferenceNovel(
  settings: AppSettings,
  projectId: string,
  refId: string,
  novelText: string
): Promise<void> {
  if (!novelText || novelText.length < 100) return

  const db = await ensureWorkspaceDb()

  db.prepare(
    `DELETE FROM story_embeddings WHERE project_id = ? AND source_type = 'reference_novel' AND source_id = ?`
  ).run(projectId, refId)

  const segments = splitForEmbedding(novelText, 800)
  if (!segments.length) return

  const { embedTexts } = await import('./embedding-service')

  const BATCH = 16
  const timestamp = new Date().toISOString()
  const stmt = db.prepare(`
    INSERT INTO story_embeddings (id, project_id, source_type, source_id, chapter_index, text_content, embedding, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (let i = 0; i < segments.length; i += BATCH) {
    const batch = segments.slice(i, i + BATCH)
    const embeddings = await embedTexts(settings, batch)
    for (let j = 0; j < batch.length; j++) {
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      const buffer = Buffer.from(embeddings[j].buffer)
      stmt.run(id, projectId, 'reference_novel', refId, null, batch[j], buffer, timestamp)
    }
  }
}

export async function searchReferenceNovel(
  settings: AppSettings,
  projectId: string,
  refId: string,
  query: string,
  topK = 20
): Promise<Array<{ text: string; score: number }>> {
  const db = await ensureWorkspaceDb()

  const rows = db.prepare(`
    SELECT text_content, embedding FROM story_embeddings
    WHERE project_id = ? AND source_type = 'reference_novel' AND source_id = ?
  `).all(projectId, refId) as Array<{ text_content: string; embedding: Buffer }>

  if (!rows.length) return []

  const queryEmbedding = await embedText(settings, query)

  return rows
    .map((row) => {
      const storedVec = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4)
      return { text: row.text_content, score: cosineSimilarity(queryEmbedding, storedVec) }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

function splitForEmbedding(text: string, maxChars = 500): string[] {
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
  if (current.trim()) segments.push(current.trim())

  return segments.filter((s) => s.length >= 30)
}
