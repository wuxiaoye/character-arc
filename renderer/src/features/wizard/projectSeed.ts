import type {
  ChapterAssistantPromptTemplate,
  ChapterDraft,
  CharacterCard,
  NovelLength,
  OutlineItem,
  OutlineVolume,
  WorldviewEntry
} from '@/types/app'
import { createOutlineVolume } from '@/features/workspace/outlineVolumes'

export interface ProjectWizardValues {
  title: string
  genre: string
  novelLength: NovelLength
  premise: string
  shouldGenerate: boolean
}

export interface ProjectBootstrapResult {
  worldviewEntries?: Array<{
    type?: string
    title?: string
    content?: string
  }>
  outlineItems?: Array<{
    title?: string
    wordTarget?: string
    conflict?: string
    summary?: string
  }>
}

export interface ProjectWorkspaceSeed {
  project: {
    title: string
    genre: string
    novelLength: NovelLength
    wordCount: string
    cover: string
    writingStylePresetId: string
    writingStylePrompt: string
    chapterAssistantTemplates: ChapterAssistantPromptTemplate[]
  }
  worldviewEntries: WorldviewEntry[]
  characters: CharacterCard[]
  outlineVolumes: OutlineVolume[]
  outlineItems: OutlineItem[]
  chapters: ChapterDraft[]
}

interface NovelLengthPreset {
  projectWordCount: string
  volumeWordTarget: string
  chapterWordTarget: string
  volumeSummary: string
}

const DEFAULT_PROJECT_COVER = 'linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)'

function createSeedId(prefix: string, index: number, timestamp: number): string {
  return `${prefix}-${timestamp}-${index + 1}`
}

function resolveNovelLengthPreset(length: NovelLength): NovelLengthPreset {
  if (length === 'short') {
    return {
      projectWordCount: '待统计',
      volumeWordTarget: '预估 3万字',
      chapterWordTarget: '预估 2000字',
      volumeSummary: '用于集中推进故事主冲突，并在较短篇幅内完成完整闭环。'
    }
  }

  return {
    projectWordCount: '待统计',
    volumeWordTarget: '预估 10万字',
    chapterWordTarget: '预估 3000字',
    volumeSummary: '用于承接作品最初的主线冲突、角色出场和后续长线铺垫。'
  }
}

function buildBlankStarterChapter(
  values: ProjectWizardValues,
  timestamp: number,
  volumeId: string,
  preset: NovelLengthPreset
): ChapterDraft {
  return {
    id: createSeedId('chapter', 0, timestamp),
    outlineItemId: '',
    volumeId,
    title: '第1章：开篇',
    summary: values.premise.trim() || '待补充章节摘要',
    status: 'draft',
    wordTarget: preset.chapterWordTarget,
    content: ''
  }
}

export function createProjectWorkspaceSeed(
  values: ProjectWizardValues,
  bootstrap?: ProjectBootstrapResult | null
): ProjectWorkspaceSeed {
  const timestamp = Date.now()
  const createdAt = new Date(timestamp).toISOString()
  const firstVolumeId = createSeedId('volume', 0, timestamp)
  const novelLength: NovelLength = values.novelLength === 'short' ? 'short' : 'long'
  const preset = resolveNovelLengthPreset(novelLength)

  const outlineVolumes = [
    createOutlineVolume({
      id: firstVolumeId,
      title: '故事开端',
      wordTarget: preset.volumeWordTarget,
      summary: values.premise.trim() || preset.volumeSummary
    })
  ]

  const outlineItems = (bootstrap?.outlineItems ?? []).map((item, index) => ({
    id: createSeedId('outline', index, timestamp),
    volumeId: firstVolumeId,
    title: item.title?.trim() || `第${index + 1}章：剧情节点`,
    wordTarget: item.wordTarget?.trim() || preset.chapterWordTarget,
    conflict: item.conflict?.trim() || '新的冲突正在酝酿。',
    summary: item.summary?.trim() || '待补充剧情摘要。',
    status: 'planned' as const,
    sortOrder: index
  }))

  const worldviewEntries = (bootstrap?.worldviewEntries ?? []).map((item, index) => ({
    id: createSeedId('world', index, timestamp),
    type: item.type?.trim() || '地理',
    title: item.title?.trim() || `设定条目 ${index + 1}`,
    content: item.content?.trim() || '待补充设定内容。',
    sortOrder: index,
    createdAt,
    updatedAt: createdAt
  }))

  const chapters = outlineItems.length
    ? outlineItems.map((item, index) => ({
        id: createSeedId('chapter', index, timestamp),
        outlineItemId: item.id,
        volumeId: item.volumeId,
        title: item.title,
        summary: item.summary,
        status: 'draft' as const,
        wordTarget: item.wordTarget,
        content: ''
      }))
    : [buildBlankStarterChapter(values, timestamp, firstVolumeId, preset)]

  return {
    project: {
      title: values.title.trim(),
      genre: values.genre.trim(),
      novelLength,
      wordCount: preset.projectWordCount,
      cover: DEFAULT_PROJECT_COVER,
      writingStylePresetId: 'cinematic-cool',
      writingStylePrompt: '',
      chapterAssistantTemplates: []
    },
    worldviewEntries,
    characters: [],
    outlineVolumes,
    outlineItems,
    chapters
  }
}
