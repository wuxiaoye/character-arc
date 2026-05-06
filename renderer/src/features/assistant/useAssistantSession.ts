import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { useMessage } from 'naive-ui'
import { marked } from 'marked'
import { buildChapterAssistantContext } from '@/features/ai/chapterAssistantContext'
import {
  getResolvedChapterAssistantTemplates,
  type ChapterAssistantQuickAction
} from '@/features/ai/chapterAssistantOptions'
import { humanizeText } from '@/features/ai/humanizeProcessor'
import { getChapterPreviewText, getPlainTextFromEditorContent } from '@/features/chapters/editorContent'
import { loadEnabledProjectSkillsContext } from '@/features/projectSkills/context'
import { buildProjectWritingStyleContext } from '@/features/writingStyles/presets'
import { useAppStore } from '@/stores/app'
import { isAssistantWindow } from '@/utils/windowKind'
import type { ChapterInsertionMode } from '@/types/app'

function toIpcPayload<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export const MORE_ACTION_OPTIONS = [
  { label: '替换选区', key: 'replace-selection' },
  { label: '追加末尾', key: 'append' },
  { label: '设为标题', key: 'set-title' },
  { label: '设为摘要', key: 'set-summary' }
]

export type AssistantMessageActionKey = typeof MORE_ACTION_OPTIONS[number]['key']

export function useAssistantSession(messagesViewport?: Ref<HTMLElement | null>) {
  const appStore = useAppStore()
  const message = useMessage()

  const draft = ref('')
  const isResponding = ref(false)
  const isStopping = ref(false)
  const activeStreamId = ref<string | null>(null)
  const streamingReply = ref('')
  const responseMode = ref<'freeform' | 'polish' | 'continue' | 'suggest' | 'reference'>('freeform')
  const responseLength = ref<'short' | 'medium' | 'long'>('medium')
  let removeAiStreamListener: (() => void) | null = null

  const currentProject = computed(() => appStore.currentProject)
  const writingStyle = computed(() => buildProjectWritingStyleContext(currentProject.value))
  const currentChapter = computed(() => appStore.selectedChapter)
  const selectedExcerpt = computed(() =>
    appStore.currentChapterSelection?.chapterId === currentChapter.value?.id
      ? appStore.currentChapterSelection.text
      : ''
  )
  const relatedChapters = computed(() => {
    const chapter = currentChapter.value
    if (!chapter) return []
    const chaptersInVolume = appStore.chapters.filter((item) => item.volumeId === chapter.volumeId)
    const currentIndex = chaptersInVolume.findIndex((item) => item.id === chapter.id)
    if (currentIndex === -1) return []
    return [chaptersInVolume[currentIndex - 1], chaptersInVolume[currentIndex + 1]]
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((item) => ({
        title: item.title,
        summary: item.summary,
        preview: getChapterPreviewText(item.content, '该章节暂无正文')
      }))
  })
  const volumeChapterSummaries = computed(() => {
    const chapter = currentChapter.value
    if (!chapter) return []
    const related = relatedChapters.value
    const relatedTitles = new Set(related.map((r) => r.title))
    return appStore.chapters
      .filter((c) => c.volumeId === chapter.volumeId && c.id !== chapter.id && !relatedTitles.has(c.title))
      .map((c) => ({ title: c.title, summary: c.summary }))
  })
  const novelOpenerSummary = computed(() => {
    const first = appStore.chapters[0]
    if (!first) return undefined
    const chapter = currentChapter.value
    if (first.id === chapter?.id) return undefined
    const related = relatedChapters.value
    if (related.some((r) => r.title === first.title)) return undefined
    return { title: first.title, summary: first.summary }
  })
  const recentAssistantMessages = computed(() =>
    appStore.messages
      .slice(-4)
      .map((item) => ({ role: item.role, content: item.content }))
  )
  const lastUserPrompt = computed(() => {
    const lastUserMessage = [...appStore.messages].reverse().find((item) => item.role === 'user')
    if (!lastUserMessage) return null
    const quickActionMatch = lastUserMessage.content.match(/^【([^】]+)】([\s\S]*)$/)
    if (!quickActionMatch) return { prompt: lastUserMessage.content, quickAction: undefined }
    return {
      quickAction: quickActionMatch[1]?.trim() || undefined,
      prompt: quickActionMatch[2]?.trim() || lastUserMessage.content
    }
  })
  const quickActions = computed(() => getResolvedChapterAssistantTemplates(currentProject.value))
  const latestAiRun = computed(() => {
    const projectId = currentProject.value?.id
    const chapterId = currentChapter.value?.id
    const runs = [...appStore.aiRuns].reverse()
    return runs.find((run) => run.projectId === projectId && (!chapterId || run.chapterId === chapterId || run.task === 'chapter-assistant'))
  })
  const latestAiRunKnowledge = computed(() => latestAiRun.value?.usedKnowledge ?? [])
  const latestAiRunStatusText = computed(() => {
    switch (latestAiRun.value?.status) {
      case 'running':
        return '运行中'
      case 'success':
        return '已完成'
      case 'error':
        return '失败'
      case 'canceled':
        return '已停止'
      default:
        return ''
    }
  })
  const hasSelection = computed(() => Boolean(selectedExcerpt.value))
  const knowledgeHitCount = computed(() => latestAiRunKnowledge.value.length)

  function renderMarkdown(content: string): string {
    return marked.parse(content, { async: false }) as string
  }

  async function scrollToBottom(): Promise<void> {
    await nextTick()
    if (messagesViewport?.value) {
      messagesViewport.value.scrollTop = messagesViewport.value.scrollHeight
    }
  }

  function resetStreamingState(): void {
    activeStreamId.value = null
    streamingReply.value = ''
    isResponding.value = false
    isStopping.value = false
  }

  async function sendPrompt(promptText?: string, quickAction?: string): Promise<void> {
    const content = (promptText ?? draft.value).trim()
    if (!content || isResponding.value) return

    const userMessage = quickAction ? `【${quickAction}】${content}` : content
    appStore.pushUserMessage(userMessage)
    draft.value = ''
    isResponding.value = true
    isStopping.value = false
    streamingReply.value = ''
    await scrollToBottom()

    try {
      const result = await window.characterArc.startAiStream(toIpcPayload({
        task: 'chapter-assistant',
        settings: appStore.appSettings,
        context: buildChapterAssistantContext({
          project: currentProject.value,
          chapter: currentChapter.value,
          chapterVolume: appStore.selectedChapterVolume,
          relatedChapters: relatedChapters.value,
          volumeChapterSummaries: volumeChapterSummaries.value,
          novelOpenerSummary: novelOpenerSummary.value,
          recentMessages: recentAssistantMessages.value,
          worldviewEntries: appStore.worldviewEntries,
          characters: appStore.characters,
          organizations: appStore.organizations,
          characterRelationships: appStore.characterRelationships,
          organizationMemberships: appStore.organizationMemberships,
          inspirationEntries: appStore.inspirationEntries,
          outlineItems: appStore.outlineItems,
          plotThreads: appStore.plotThreads,
          selectedText: selectedExcerpt.value,
          responseMode: responseMode.value,
          responseLength: responseLength.value,
          quickAction,
          userPrompt: content,
          chapterContent: getPlainTextFromEditorContent(currentChapter.value?.content ?? ''),
          projectSkills: await loadEnabledProjectSkillsContext(currentProject.value, 'draft')
        })
      }))

      const streamId = (result.result as { streamId?: string } | undefined)?.streamId
      if (!result.success || !streamId) throw new Error(result.error ?? 'AI 流式生成启动失败')
      activeStreamId.value = streamId
    } catch (error) {
      resetStreamingState()
      message.error(error instanceof Error ? error.message : 'AI 请求失败')
    }
  }

  async function createOutlineDraft(promptText: string, quickAction: string): Promise<void> {
    const content = promptText.trim()
    if (!content || isResponding.value) return

    appStore.pushUserMessage(`【${quickAction}】${content}`)
    isResponding.value = true
    await scrollToBottom()

    try {
      const result = await window.characterArc.generateAi(toIpcPayload({
        task: 'outline-item',
        settings: appStore.appSettings,
        context: {
          projectTitle: currentProject.value?.title,
          projectGenre: currentProject.value?.genre,
          writingStyleLabel: writingStyle.value.label,
          writingStylePrompt: writingStyle.value.prompt,
          chapterTitle: currentChapter.value?.title,
          chapterSummary: currentChapter.value?.summary,
          chapterWordTarget: currentChapter.value?.wordTarget,
          chapterContent: getPlainTextFromEditorContent(currentChapter.value?.content ?? ''),
          chapterVolumeTitle: appStore.selectedChapterVolume?.title,
          chapterVolumeSummary: appStore.selectedChapterVolume?.summary,
          outlineTitles: appStore.outlineItems.map((item) => item.title),
          worldviewTitles: appStore.worldviewEntries.map((entry) => entry.title),
          characters: appStore.characters.map((character) => ({
            name: character.name,
            role: character.role,
            description: character.description
          })),
          currentVolumeOutlineItems: appStore.outlineItems
            .filter((item) => item.volumeId === appStore.selectedChapterVolume?.id)
            .slice(-4)
            .map((item) => ({ title: item.title, conflict: item.conflict, summary: item.summary })),
          userPrompt: content
        }
      }))

      if (!result.success || !result.result) throw new Error(result.error ?? 'AI 未返回有效大纲草稿')

      const item = result.result as { title?: string; wordTarget?: string; conflict?: string; summary?: string }
      appStore.createOutlineItem({
        volumeId: appStore.selectedChapterVolume?.id || currentChapter.value?.volumeId,
        title: item.title,
        wordTarget: item.wordTarget,
        conflict: item.conflict,
        summary: item.summary
      })
      appStore.pushAssistantMessage(
        `已创建下一章大纲草稿：${item.title ?? '新剧情节点'}\n预估字数：${item.wordTarget ?? '预估 3000字'}\n核心冲突：${item.conflict ?? '新的冲突正在酝酿。'}\n剧情摘要：${item.summary ?? 'AI 未返回有效剧情摘要'}`
      )
      await scrollToBottom()
      message.success('AI 已写入下一章大纲草稿')
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'AI 生成下一章大纲失败')
    } finally {
      isResponding.value = false
    }
  }

  function handleQuickAction(action: ChapterAssistantQuickAction): void {
    if (action.requiresSelection && !selectedExcerpt.value) {
      message.warning('请先在正文中选中要处理的段落')
      return
    }

    responseMode.value = action.mode
    responseLength.value = action.length
    if (action.task === 'outline-draft') {
      void createOutlineDraft(action.prompt, action.label)
      return
    }

    void sendPrompt(action.prompt, action.label)
  }

  function handleInsert(content: string, mode: ChapterInsertionMode): void {
    const insertion = content.trim()
    if (!appStore.selectedChapter || !insertion) {
      message.warning('当前没有可插入内容的章节')
      return
    }

    if (isAssistantWindow) {
      void window.characterArc.publishAssistantCommand(toIpcPayload({ type: 'insert-into-chapter', content: insertion, mode }))
      if (mode === 'append') {
        message.success('AI 内容已发送到主窗口并准备追加到正文末尾')
        return
      }
      if (mode === 'replace-selection') {
        message.success('AI 内容已发送到主窗口并准备替换当前选区')
        return
      }
      message.success('AI 内容已发送到主窗口，等待插入正文')
      return
    }

    const inserted = appStore.insertIntoChapter(content, mode)
    if (!inserted) {
      message.warning('当前没有可插入内容的章节')
      return
    }
    if (mode === 'append') {
      message.success('AI 内容已追加到正文末尾')
      return
    }
    if (mode === 'replace-selection') {
      message.success('AI 内容已尝试替换当前选区')
      return
    }
    message.success('AI 内容已插入正文')
  }

  function handleUseAsSummary(content: string): void {
    const nextSummary = content.trim()
    if (!appStore.selectedChapter || !nextSummary) {
      message.warning('当前没有可更新摘要的章节')
      return
    }
    appStore.updateChapterSummary(nextSummary)
    message.success('AI 内容已设为本章摘要')
  }

  function handleUseAsTitle(content: string): void {
    const nextTitle = content
      .split('\n').map((line) => line.trim()).find(Boolean)
      ?.replace(/^[-*#\d.\s]+/, '')
      .replace(/^标题[:：]\s*/, '')
      .replace(/[「」"'"]/g, '')
      .trim()
    if (!appStore.selectedChapter || !nextTitle) {
      message.warning('当前没有可更新标题的章节')
      return
    }
    appStore.updateChapterTitle(nextTitle)
    message.success('AI 内容已设为章节标题')
  }

  function handleMoreAction(key: string, content: string): void {
    switch (key as AssistantMessageActionKey) {
      case 'replace-selection':
        handleInsert(content, 'replace-selection')
        break
      case 'append':
        handleInsert(content, 'append')
        break
      case 'set-title':
        handleUseAsTitle(content)
        break
      case 'set-summary':
        handleUseAsSummary(content)
        break
    }
  }

  function handleRegenerate(): void {
    const prompt = lastUserPrompt.value
    if (!prompt || isResponding.value) return
    void sendPrompt(prompt.prompt, prompt.quickAction)
  }

  async function handleStopResponse(): Promise<void> {
    if (!activeStreamId.value || isStopping.value) return
    isStopping.value = true
    const result = await window.characterArc.stopAiStream(activeStreamId.value)
    if (!result.success) {
      isStopping.value = false
      message.error(result.error ?? '停止生成失败')
    }
  }

  function handleComposerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendPrompt()
    }
  }

  function handleAiStreamEvent(payload: CharacterArcAiStreamEvent): void {
    if (payload.streamId !== activeStreamId.value) return

    if (payload.type === 'chunk') {
      streamingReply.value += payload.delta
      void scrollToBottom()
      return
    }

    if (payload.type === 'done') {
      const finalReply = humanizeText(payload.content ?? streamingReply.value)
      if (finalReply) appStore.pushAssistantMessage(finalReply)
      resetStreamingState()
      void scrollToBottom()
      return
    }

    if (payload.type === 'canceled') {
      const partialReply = humanizeText(payload.content ?? streamingReply.value)
      if (partialReply) {
        appStore.pushAssistantMessage(partialReply)
        message.info('已停止生成，并保留当前已生成内容')
      } else {
        message.info('已停止生成')
      }
      resetStreamingState()
      void scrollToBottom()
      return
    }

    if (payload.type === 'error') {
      resetStreamingState()
      message.error(payload.error || 'AI 流式请求失败')
    }
  }

  onMounted(() => {
    removeAiStreamListener = window.characterArc.onAiStreamEvent(handleAiStreamEvent)
  })

  onBeforeUnmount(() => {
    if (activeStreamId.value) void window.characterArc.stopAiStream(activeStreamId.value)
    removeAiStreamListener?.()
    removeAiStreamListener = null
  })

  watch(
    () => appStore.messages.length,
    () => {
      void scrollToBottom()
    }
  )

  watch(
    [() => appStore.pendingAssistantRequest, isResponding],
    async ([request, busy]) => {
      if (!request || busy) return
      await sendPrompt(request.prompt, request.quickAction)
      appStore.consumeAssistantPrompt(request.id)
    },
    { deep: true }
  )

  return {
    appStore,
    draft,
    isResponding,
    isStopping,
    activeStreamId,
    streamingReply,
    responseMode,
    responseLength,
    currentProject,
    currentChapter,
    writingStyle,
    selectedExcerpt,
    relatedChapters,
    volumeChapterSummaries,
    novelOpenerSummary,
    recentAssistantMessages,
    lastUserPrompt,
    quickActions,
    latestAiRun,
    latestAiRunKnowledge,
    latestAiRunStatusText,
    hasSelection,
    knowledgeHitCount,
    renderMarkdown,
    sendPrompt,
    createOutlineDraft,
    handleQuickAction,
    handleInsert,
    handleUseAsSummary,
    handleUseAsTitle,
    handleMoreAction,
    handleRegenerate,
    handleStopResponse,
    handleComposerKeydown,
    scrollToBottom,
    resetStreamingState
  }
}
