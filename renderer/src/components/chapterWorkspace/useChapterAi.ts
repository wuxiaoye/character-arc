import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { buildChapterAssistantContext } from '@/features/ai/chapterAssistantContext'
import { getChapterPreviewText, getPlainTextFromEditorContent } from '@/features/chapters/editorContent'
import { loadEnabledProjectSkillsContext } from '@/features/projectSkills/context'
import { useAppStore } from '@/stores/app'
import { toIpcPayload } from '@/utils/ipcPayload'
import type { ChapterInsertionMode } from '@/types/app'

export type ChapterAiRole = 'user' | 'assistant'

export interface ChapterAiMessage {
  id: string
  role: ChapterAiRole
  content: string
  /** 与 AI 上下文相关的章节 ID，用于切章后区分 */
  chapterId?: string
}

const TASK_KEY = 'chapter-workspace-chat'

let messageSeq = 0
function nextMessageId(): string {
  messageSeq += 1
  return `cwm-${Date.now().toString(36)}-${messageSeq}`
}

export function useChapterAi(): {
  messages: Ref<ChapterAiMessage[]>
  isResponding: Ref<boolean>
  hasSelection: Ref<boolean>
  selectedText: Ref<string>
  send: (prompt: string) => Promise<void>
  resetMessages: () => void
  applyToChapter: (content: string, mode: ChapterInsertionMode) => boolean
} {
  const appStore = useAppStore()
  const messages = ref<ChapterAiMessage[]>([])
  const isResponding = computed(() => appStore.isAiTaskRunning(TASK_KEY))

  const selectedText = computed(() => appStore.currentChapterSelection?.text.trim() ?? '')
  const hasSelection = computed(() =>
    Boolean(
      appStore.currentChapterSelection?.chapterId === appStore.selectedChapter?.id
      && selectedText.value
    )
  )

  function pushMessage(role: ChapterAiRole, content: string): ChapterAiMessage {
    const item: ChapterAiMessage = {
      id: nextMessageId(),
      role,
      content,
      chapterId: appStore.selectedChapter?.id
    }
    messages.value.push(item)
    return item
  }

  async function send(prompt: string): Promise<void> {
    const trimmed = prompt.trim()
    if (!trimmed) return
    if (isResponding.value) return

    const chapter = appStore.selectedChapter
    if (!chapter) {
      pushMessage('assistant', '请先在左侧选择或新建一个章节，再使用 AI 助手。')
      return
    }

    pushMessage('user', trimmed)

    try {
      const response = await appStore.runTrackedAiTask(
        {
          key: TASK_KEY,
          kind: 'chapter-assistant',
          label: 'AI 章节助手',
          description: '与创作助理对话',
          panel: 'chapters'
        },
        async () => {
          const projectSkills = await loadEnabledProjectSkillsContext(appStore.currentProject, 'draft')
          const sameVolume = appStore.chapters.filter((item) => item.volumeId === chapter.volumeId)
          const context = buildChapterAssistantContext({
            project: appStore.currentProject,
            chapter,
            chapterVolume: appStore.selectedChapterVolume,
            relatedChapters: sameVolume
              .filter((item) => item.id !== chapter.id)
              .slice(0, 2)
              .map((item) => ({
                title: item.title,
                summary: item.summary,
                preview: getChapterPreviewText(item.content, '该章节暂无正文')
              })),
            volumeChapterSummaries: sameVolume
              .filter((item) => item.id !== chapter.id)
              .map((item) => ({ title: item.title, summary: item.summary })),
            novelOpenerSummary:
              appStore.chapters[0] && appStore.chapters[0].id !== chapter.id
                ? { title: appStore.chapters[0].title, summary: appStore.chapters[0].summary }
                : undefined,
            recentMessages: messages.value
              .slice(-6, -1)
              .map((item) => ({ role: item.role, content: item.content })),
            worldviewEntries: appStore.worldviewEntries,
            characters: appStore.characters,
            organizations: appStore.organizations,
            characterRelationships: appStore.characterRelationships,
            organizationMemberships: appStore.organizationMemberships,
            inspirationEntries: appStore.inspirationEntries,
            outlineItems: appStore.outlineItems,
            plotThreads: appStore.plotThreads,
            workflowDocuments: appStore.workflowDocuments,
            knowledgeDocuments: appStore.knowledgeDocuments,
            selectedText: selectedText.value,
            responseMode: 'freeform',
            responseLength: 'medium',
            userPrompt: trimmed,
            chapterContent: getPlainTextFromEditorContent(chapter.content ?? ''),
            projectSkills
          })
          return window.characterArc.generateAi(toIpcPayload({
            task: 'chapter-assistant',
            settings: appStore.appSettings,
            context
          }))
        }
      )

      const payload = response.result as { content?: string } | undefined
      const reply = String(payload?.content ?? '').trim()
      if (!response.success || !reply) {
        throw new Error(response.error ?? 'AI 未返回内容')
      }
      pushMessage('assistant', reply)
    } catch (error) {
      pushMessage('assistant', `生成失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  function resetMessages(): void {
    messages.value = []
  }

  function applyToChapter(content: string, mode: ChapterInsertionMode): boolean {
    return appStore.insertIntoChapter(content, mode)
  }

  return {
    messages,
    isResponding,
    hasSelection,
    selectedText,
    send,
    resetMessages,
    applyToChapter
  }
}
