import { buildStoryStateContext, applyStateDelta } from '../story-state-store'
import { extractStateDeltaViaLLM } from './runtime/orchestrator'
import type { AppSettings } from './shared-types'
import { ensureWorkspaceDb } from '../workspace-store'

export type BackfillProgressPayload = {
  projectId: string
  current: number
  total: number
  chapterTitle: string
  phase: 'extracting' | 'applying' | 'done'
}

export type BackfillResult = {
  totalChapters: number
  processedChapters: number
  skipped: number
}

/**
 * 遍历项目现存章节，逐章调用状态提取器并写入 `story_character_state` 等状态表。
 * 用于为"已有章节但状态库为空"的项目补录结构化世界状态。
 */
export async function backfillProjectStateFromChapters(
  settings: AppSettings,
  projectId: string,
  onProgress: (p: BackfillProgressPayload) => void
): Promise<BackfillResult> {
  const db = await ensureWorkspaceDb()

  const chapters = db.prepare(`
    SELECT id, title, content, sort_order AS sortOrder
    FROM chapters
    WHERE project_id = ? AND content IS NOT NULL AND LENGTH(content) >= 50
    ORDER BY sort_order ASC
  `).all(projectId) as Array<{ id: string; title: string; content: string; sortOrder: number }>

  let processed = 0
  let skipped = 0

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i]
    const chapterTitle = ch.title || `第 ${i + 1} 章`
    onProgress({ projectId, current: i + 1, total: chapters.length, chapterTitle, phase: 'extracting' })

    try {
      const preState = buildStoryStateContext(db, projectId, [])
      const delta = await extractStateDeltaViaLLM(settings, ch.content, preState)
      if (delta) {
        onProgress({ projectId, current: i + 1, total: chapters.length, chapterTitle, phase: 'applying' })
        applyStateDelta(db, projectId, ch.sortOrder, delta)
        processed++
      } else {
        skipped++
      }
    } catch {
      skipped++
    }
  }

  onProgress({ projectId, current: chapters.length, total: chapters.length, chapterTitle: '', phase: 'done' })
  return { totalChapters: chapters.length, processedChapters: processed, skipped }
}
