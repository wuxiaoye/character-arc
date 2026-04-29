import { Lightbulb, PenTool, Rows3, ScrollText, Sparkles } from 'lucide-vue-next'

export const chapterAssistantModeOptions = [
  { label: '自由', value: 'freeform' as const },
  { label: '润色', value: 'polish' as const },
  { label: '续写', value: 'continue' as const },
  { label: '建议', value: 'suggest' as const },
  { label: '设定', value: 'reference' as const }
] as const

export const chapterAssistantLengthOptions = [
  { label: '短', value: 'short' as const },
  { label: '中', value: 'medium' as const },
  { label: '长', value: 'long' as const }
] as const

export const chapterAssistantQuickActions = [
  {
    label: '润色选中',
    prompt: '请只针对当前选中的正文片段做一版润色，保留原意和剧情信息，提升节奏、画面感与表达准确度。直接输出润色后的最终文本。',
    icon: PenTool,
    mode: 'polish' as const,
    length: 'medium' as const,
    task: 'chat' as const,
    requiresSelection: true
  },
  {
    label: '下一章大纲',
    prompt: '请基于当前章节、分卷目标和已有剧情，生成一条适合作为下一章的大纲草稿。',
    icon: Rows3,
    mode: 'suggest' as const,
    length: 'medium' as const,
    task: 'outline-draft' as const,
    requiresSelection: false
  },
  {
    label: '章节标题',
    prompt: '请基于当前章节内容、分卷定位和剧情推进，拟定一个更贴切的章节标题。只保留一个最终标题，要求有小说感，简洁，不要解释。',
    icon: PenTool,
    mode: 'freeform' as const,
    length: 'short' as const,
    task: 'chat' as const,
    requiresSelection: false
  },
  {
    label: '章节摘要',
    prompt: '请基于当前章节内容，生成一段适合作为章节摘要或本章定位的简洁文案，突出主要冲突与推进，控制在 60 到 100 字。',
    icon: ScrollText,
    mode: 'freeform' as const,
    length: 'short' as const,
    task: 'chat' as const,
    requiresSelection: false
  },
  {
    label: '描写环境',
    prompt: '请基于当前章节氛围，补写一段可以直接插入正文的环境描写，让画面感更强。',
    icon: ScrollText,
    mode: 'continue' as const,
    length: 'medium' as const,
    task: 'chat' as const,
    requiresSelection: false
  },
  {
    label: '润色段落',
    prompt: '请基于当前章节内容给出一版更有节奏感和画面感的润色稿，优先输出可直接插入正文的内容。',
    icon: PenTool,
    mode: 'polish' as const,
    length: 'medium' as const,
    task: 'chat' as const,
    requiresSelection: false
  },
  {
    label: '续写片段',
    prompt: '请紧接当前章节正文往后续写一小段，保持人物语气、世界观和剧情方向一致。',
    icon: Sparkles,
    mode: 'continue' as const,
    length: 'long' as const,
    task: 'chat' as const,
    requiresSelection: false
  },
  {
    label: '下一章建议',
    prompt: '请结合当前章节、分卷目标和已有大纲，给出 3 条下一章剧情推进建议。每条都要包含推进方向、核心冲突和一个能勾住读者的钩子。',
    icon: Lightbulb,
    mode: 'suggest' as const,
    length: 'medium' as const,
    task: 'chat' as const,
    requiresSelection: false
  }
] as const

export type ChapterAssistantQuickAction = (typeof chapterAssistantQuickActions)[number]
