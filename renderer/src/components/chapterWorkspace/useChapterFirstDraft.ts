import { ref } from 'vue'
import type { Ref } from 'vue'
import { buildChapterFirstDraftContext } from '@/features/ai/chapterAssistantContext'
import {
  ensureEditorHtmlContent,
  getChapterPreviewText,
  getPlainTextFromEditorContent
} from '@/features/chapters/editorContent'
import { formatChapterWordTargetLabel, parseChapterWordTarget } from '@/features/chapters/wordTarget'
import { loadEnabledProjectSkillsContext } from '@/features/projectSkills/context'
import { useAppStore } from '@/stores/app'
import { toIpcPayload } from '@/utils/ipcPayload'

const TASK_KEY = 'chapter-first-draft'

export function useChapterFirstDraft(): {
  isGenerating: Ref<boolean>
  isStopping: Ref<boolean>
  modalVisible: Ref<boolean>
  streamingContent: Ref<string>
  streamingCharCount: Ref<number>
  executionLabel: Ref<string>
  progressPercent: Ref<number>
  progressText: Ref<string>
  start: () => Promise<void>
  stop: () => Promise<void>
  closeModal: () => void
  registerStreamListener: () => void
  unregisterStreamListener: () => void
} {
  const appStore = useAppStore()

  const isGenerating = ref(false)
  const isStopping = ref(false)
  const modalVisible = ref(false)
  const streamingContent = ref('')
  const streamingCharCount = ref(0)
  const executionLabel = ref('')

  const streamId = ref<string | null>(null)
  let resolveStream: ((text: string) => void) | null = null
  let rejectStream: ((err: Error) => void) | null = null
  let removeListener: (() => void) | null = null

  const progressPercent = ref(0)
  const progressText = ref('')

  function recompute(): void {
    const target = Math.max(parseChapterWordTarget(appStore.selectedChapter?.wordTarget), 1)
    const words = streamingCharCount.value || streamingContent.value.trim().length
    if (!isGenerating.value) {
      progressPercent.value = 0
      progressText.value = ''
      return
    }
    if (!words) {
      progressPercent.value = 12
      progressText.value = '正在整理大纲、文风和角色关系上下文...'
      return
    }
    const estimated = Math.round((words / target) * 100)
    progressPercent.value = Math.min(95, Math.max(18, estimated))
    progressText.value = `已生成 ${words} 字 / 目标 ${formatChapterWordTargetLabel(target)}（${progressPercent.value}%）`
  }

  function reset(): void {
    streamId.value = null
    streamingCharCount.value = 0
    executionLabel.value = ''
    isStopping.value = false
    isGenerating.value = false
    recompute()
  }

  function handleStreamEvent(payload: CharacterArcAiStreamEvent): void {
    if (payload.streamId !== streamId.value) return

    if (payload.type === 'chunk') {
      streamingContent.value += payload.delta
      if (payload.charCount != null) streamingCharCount.value = payload.charCount
      recompute()
      return
    }
    if (payload.type === 'done') {
      const text = (payload.content ?? streamingContent.value).trim()
      const resolve = resolveStream
      resolveStream = null
      rejectStream = null
      resolve?.(text)
      return
    }
    if (payload.type === 'canceled') {
      const reject = rejectStream
      resolveStream = null
      rejectStream = null
      reject?.(new Error('canceled'))
      return
    }
    if (payload.type === 'error') {
      const reject = rejectStream
      resolveStream = null
      rejectStream = null
      reject?.(new Error(payload.error || 'AI 初稿生成失败'))
    }
  }

  function registerStreamListener(): void {
    if (removeListener) return
    removeListener = window.characterArc.onAiStreamEvent(handleStreamEvent)
  }

  function unregisterStreamListener(): void {
    removeListener?.()
    removeListener = null
  }

  async function streamDraft(context: Record<string, unknown>): Promise<string> {
    streamingContent.value = ''
    streamingCharCount.value = 0

    const result = await window.characterArc.startAiStream(toIpcPayload({
      task: 'chapter-first-draft',
      settings: appStore.appSettings,
      context
    }))

    const sid = (result.result as { streamId?: string } | undefined)?.streamId
    if (!result.success || !sid) {
      throw new Error(result.error ?? 'AI 初稿生成启动失败')
    }
    streamId.value = sid

    return new Promise<string>((resolve, reject) => {
      resolveStream = resolve
      rejectStream = reject
    })
  }

  async function start(): Promise<void> {
    const chapter = appStore.selectedChapter
    const project = appStore.currentProject
    const chapterVolume = appStore.selectedChapterVolume
    if (!chapter || !project || !chapterVolume) return
    if (isGenerating.value) return

    registerStreamListener()
    isGenerating.value = true
    isStopping.value = false
    streamingContent.value = ''
    executionLabel.value = '正在整理本章上下文'
    modalVisible.value = true
    recompute()

    try {
      await appStore.runTrackedAiTask(
        {
          key: TASK_KEY,
          kind: 'chapter-draft',
          label: 'AI 生成章节初稿',
          description: `正在生成《${chapter.title}》初稿`,
          panel: 'chapters',
          onCancel: () => { void stop() }
        },
        async () => {
          const targetWordCount = parseChapterWordTarget(chapter.wordTarget)
          const relatedChapters = appStore.chapters
            .filter((item) => item.id !== chapter.id)
            .slice(-4)
            .map((item) => ({
              title: item.title,
              summary: item.summary,
              preview: getChapterPreviewText(item.content, '该章节暂无正文')
            }))
          const relatedTitles = new Set(relatedChapters.map((r) => r.title))
          const volumeChapterSummaries = appStore.chapters
            .filter((c) => c.volumeId === chapter.volumeId && c.id !== chapter.id && !relatedTitles.has(c.title))
            .map((c) => ({ title: c.title, summary: c.summary }))
          const firstChapter = appStore.chapters[0]
          const novelOpenerSummary =
            firstChapter && firstChapter.id !== chapter.id && !relatedTitles.has(firstChapter.title)
              ? { title: firstChapter.title, summary: firstChapter.summary }
              : undefined

          const context = buildChapterFirstDraftContext({
            project,
            chapter,
            chapterVolume,
            relatedChapters,
            volumeChapterSummaries,
            novelOpenerSummary,
            worldviewEntries: appStore.worldviewEntries,
            characters: appStore.characters,
            organizations: appStore.organizations,
            characterRelationships: appStore.characterRelationships,
            organizationMemberships: appStore.organizationMemberships,
            inspirationEntries: appStore.inspirationEntries,
            outlineItems: appStore.outlineItems.filter((item) => item.volumeId === chapter.volumeId),
            plotThreads: appStore.plotThreads,
            chapterContent: getPlainTextFromEditorContent(chapter.content ?? ''),
            targetWordCount,
            userPrompt: `请生成这一章的完整初稿，目标字数约 ${targetWordCount} 字（参考值，优先保证情节自然完整）。如果当前正文为空，就从零起稿；如果当前正文不为空，也按整章重写处理，而不是续写。`,
            projectSkills: await loadEnabledProjectSkillsContext(project, 'draft')
          })

          executionLabel.value = `正在生成本章初稿（目标约 ${targetWordCount} 字）…`
          recompute()
          const fullText = await streamDraft(context)
          if (fullText) {
            executionLabel.value = '正在覆盖当前章节'
            appStore.updateChapterContent(ensureEditorHtmlContent(fullText))
          }
        }
      )
    } catch (error) {
      const isCanceled = error instanceof Error && error.message === 'canceled'
      if (!isCanceled) throw error
    } finally {
      reset()
    }
  }

  async function stop(): Promise<void> {
    if (!streamId.value || isStopping.value) return
    isStopping.value = true
    const result = await window.characterArc.stopAiStream(streamId.value)
    if (!result.success) {
      isStopping.value = false
      throw new Error(result.error ?? '停止 AI 初稿失败')
    }
  }

  function closeModal(): void {
    if (isGenerating.value) return
    modalVisible.value = false
    streamingContent.value = ''
  }

  return {
    isGenerating,
    isStopping,
    modalVisible,
    streamingContent,
    streamingCharCount,
    executionLabel,
    progressPercent,
    progressText,
    start,
    stop,
    closeModal,
    registerStreamListener,
    unregisterStreamListener
  }
}
