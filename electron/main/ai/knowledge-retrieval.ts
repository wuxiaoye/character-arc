/**
 * 统一的知识检索模块。
 *
 * 合并了旧版两套检索：
 * - 关键词检索（原 electron/main/knowledge-retrieval.ts）：用于给 prompt 注入 `usedKnowledge`（参考拆书总纲、canon-fact、章节摘要等）。
 * - 混合检索（原 electron/main/ai/knowledge-retrieval-v2.ts）：状态块 + 向量语义检索，用于给 chapter-first-draft/chapter-assistant 等任务注入结构化世界状态和相关章节片段。
 *
 * 向量检索在 embedding 不可用时自动退化为仅状态块注入，不抛错。
 */

import type { DatabaseSync } from 'node:sqlite'
import type { AiTaskPayload, AppSettings } from './shared-types'
import { buildStoryStateContext, formatStoryStateForPrompt } from '../story-state-store'
import { embedText, cosineSimilarity, embedTexts, providerSupportsEmbedding } from './embedding-service'
import { ensureWorkspaceDb } from '../workspace-store'

// ─────────────────────────────────────────────────────────────
// 关键词检索（usedKnowledge）
// ─────────────────────────────────────────────────────────────

type KnowledgeDocumentSourceType = 'reference-summary' | 'reference-chunk' | 'workflow-document' | 'canon-fact' | 'chapter-summary'

type WorkspaceKnowledgeDocument = {
  id: string
  projectId: string
  title: string
  sourceType: KnowledgeDocumentSourceType
  sourceLabel: string
  content: string
  summary: string
  keywords: string[]
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type WorkspaceAiRunKnowledgeItem = {
  documentId: string
  title: string
  sourceType: KnowledgeDocumentSourceType
  sourceLabel: string
  snippet: string
  keywords: string[]
}

function tokenizeKnowledgeText(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
}

function buildKnowledgeQuery(task: AiTaskPayload): string {
  return [
    String(task.context.userPrompt ?? ''),
    String(task.context.quickAction ?? ''),
    String(task.context.projectTitle ?? ''),
    String(task.context.projectGenre ?? ''),
    String(task.context.chapterVolumeTitle ?? ''),
    String(task.context.chapterVolumeSummary ?? ''),
    String(task.context.chapterTitle ?? ''),
    String(task.context.chapterSummary ?? ''),
    String(task.context.selectedText ?? ''),
    String(task.context.sceneFocus ?? ''),
    String(task.context.chapterContent ?? '').slice(0, 1200)
  ].filter(Boolean).join('\n')
}

function isProjectKnowledgeSource(sourceType: KnowledgeDocumentSourceType): boolean {
  return sourceType === 'workflow-document' || sourceType === 'canon-fact' || sourceType === 'chapter-summary'
}

function resolveKnowledgeSourceBaseScore(sourceType: KnowledgeDocumentSourceType): number {
  switch (sourceType) {
    case 'canon-fact': return 3.4
    case 'chapter-summary': return 2.8
    case 'workflow-document': return 2.4
    case 'reference-summary': return 1.4
    case 'reference-chunk':
    default: return 1
  }
}

const KNOWLEDGE_RETRIEVAL_TASKS: ReadonlySet<string> = new Set([
  'chapter-assistant',
  'chapter-first-draft',
  'assistant-action-proposal',
  'outline-batch',
  'outline-chain',
  'outline-item',
  'inspiration-pack',
  'chapter-analysis',
  'chapter-scene-plan',
  'project-bootstrap'
])

function buildKnowledgeSnippet(document: WorkspaceKnowledgeDocument): string {
  const sourceType = document.sourceType
  if (sourceType === 'reference-summary') {
    const text = (document.content || document.summary || '').trim()
    return text.length > 2400 ? `${text.slice(0, 2400)}…` : text
  }
  if (sourceType === 'reference-chunk') {
    const text = (document.content || document.summary || '').trim()
    return text.length > 1400 ? `${text.slice(0, 1400)}…` : text
  }
  const text = (document.summary || document.content || '').trim()
  return text.length > 320 ? `${text.slice(0, 320)}…` : text
}

export function retrieveKnowledgeContext(
  task: AiTaskPayload,
  latestWorkspaceSnapshot: { workspaces?: Record<string, { knowledgeDocuments?: WorkspaceKnowledgeDocument[] }> } | null
): { usedKnowledge: WorkspaceAiRunKnowledgeItem[] } {
  if (!KNOWLEDGE_RETRIEVAL_TASKS.has(task.task)) {
    return { usedKnowledge: [] }
  }

  const projectId = String(task.context.projectId ?? '').trim()
  if (!projectId || !latestWorkspaceSnapshot?.workspaces?.[projectId]) {
    return { usedKnowledge: [] }
  }

  const workspace = latestWorkspaceSnapshot.workspaces[projectId]
  const documents = Array.isArray(workspace.knowledgeDocuments) ? workspace.knowledgeDocuments : []
  if (!documents.length) {
    return { usedKnowledge: [] }
  }

  const queryText = buildKnowledgeQuery(task)
  const queryTokens = Array.from(new Set(tokenizeKnowledgeText(queryText)))
  if (!queryTokens.length) {
    return { usedKnowledge: [] }
  }

  const ranked = documents
    .map((document) => {
      const title = String(document.title ?? '').toLowerCase()
      const summary = String(document.summary ?? '').toLowerCase()
      const sourceLabel = String(document.sourceLabel ?? '').toLowerCase()
      const keywords = Array.isArray(document.keywords) ? document.keywords.map((k) => String(k).trim()).filter(Boolean) : []
      const lowerKeywords = keywords.map((k) => k.toLowerCase())
      const keywordSet = new Set(lowerKeywords)

      const contentText = String(document.content ?? '').toLowerCase()
      const wordSet = new Set(tokenizeKnowledgeText(`${title} ${summary} ${contentText} ${sourceLabel}`))

      let score = resolveKnowledgeSourceBaseScore(document.sourceType)

      for (const token of queryTokens) {
        if (keywordSet.has(token)) score += 4
        else if (lowerKeywords.some((k) => k.includes(token) || token.includes(k))) score += 2.5
        if (title.includes(token)) score += 2
        if (sourceLabel.includes(token)) score += 1.5
        if (summary.includes(token)) score += 1.2
        if (wordSet.has(token)) score += 0.6
      }

      return { score, document, keywords, projectSource: isProjectKnowledgeSource(document.sourceType) }
    })
    .filter((entry) => entry.score > 2)
    .sort((a, b) => b.score - a.score)

  const selectedIds = new Set<string>()
  const selected = [
    ...ranked.filter((e) => e.projectSource).slice(0, 3),
    ...ranked.filter((e) => !e.projectSource).slice(0, 2)
  ].filter((e) => { if (selectedIds.has(e.document.id)) return false; selectedIds.add(e.document.id); return true })

  for (const entry of ranked) {
    if (selected.length >= 5) break
    if (selectedIds.has(entry.document.id)) continue
    selected.push(entry)
    selectedIds.add(entry.document.id)
  }

  return {
    usedKnowledge: selected
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ document, keywords }) => ({
        documentId: document.id,
        title: document.title,
        sourceType: document.sourceType,
        sourceLabel: document.sourceLabel,
        snippet: buildKnowledgeSnippet(document),
        keywords: keywords.slice(0, 8)
      }))
  }
}

// ─────────────────────────────────────────────────────────────
// 混合检索（state block + 语义段）
// ─────────────────────────────────────────────────────────────

export interface HybridRetrievalResult {
  storyStateBlock: string
  semanticSegments: Array<{ text: string; score: number; sourceType: string; chapterIndex?: number }>
}

const SEMANTIC_TOP_K = 8
const SEMANTIC_MIN_SCORE = 0.68
const HYBRID_RETRIEVAL_TASKS = new Set([
  'chapter-first-draft',
  'chapter-assistant',
  'chapter-analysis',
  'chapter-scene-plan'
])

export async function retrieveHybridContext(
  task: AiTaskPayload,
  settings: AppSettings
): Promise<HybridRetrievalResult | null> {
  if (!HYBRID_RETRIEVAL_TASKS.has(task.task)) return null

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
    // embedding 不可用时静默退化为仅返回 state block
  }

  return { storyStateBlock, semanticSegments }
}

async function retrieveSemanticSegments(
  db: DatabaseSync,
  projectId: string,
  task: AiTaskPayload,
  settings: AppSettings
): Promise<HybridRetrievalResult['semanticSegments']> {
  if (!providerSupportsEmbedding(settings)) return []

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

// ─────────────────────────────────────────────────────────────
// 向量索引写入
// ─────────────────────────────────────────────────────────────

export async function indexChapterSegments(
  settings: AppSettings,
  projectId: string,
  chapterIndex: number,
  chapterContent: string,
  chapterId: string
): Promise<void> {
  if (!chapterContent || chapterContent.length < 50) return
  if (!providerSupportsEmbedding(settings)) return

  const db = await ensureWorkspaceDb()

  db.prepare(
    `DELETE FROM story_embeddings WHERE project_id = ? AND source_id = ?`
  ).run(projectId, chapterId)

  const segments = splitForEmbedding(chapterContent)
  if (!segments.length) return

  let embeddings: Float32Array[]
  try {
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
  if (!providerSupportsEmbedding(settings)) return

  const db = await ensureWorkspaceDb()

  db.prepare(
    `DELETE FROM story_embeddings WHERE project_id = ? AND source_type = 'reference_novel' AND source_id = ?`
  ).run(projectId, refId)

  const segments = splitForEmbedding(novelText, 800)
  if (!segments.length) return

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
