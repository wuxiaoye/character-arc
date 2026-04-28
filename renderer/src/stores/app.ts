import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { getThemePreset } from '@/theme/presets'
import type {
  AppSettings,
  ChapterDraft,
  ChatMessage,
  CharacterCard,
  OutlineItem,
  PanelName,
  ProjectSummary,
  ThemeName,
  WorldviewEntry
} from '@/types/app'

const STORAGE_KEY = 'characterarc-app-state'

interface StoredState {
  theme: ThemeName
  selectedProjectId: string
  projects: ProjectSummary[]
  worldviewEntries: WorldviewEntry[]
  characters: CharacterCard[]
  outlineItems: OutlineItem[]
  chapters: ChapterDraft[]
  appSettings: AppSettings
}

const defaultProjects: ProjectSummary[] = [
  {
    id: 'project-1',
    title: '赛博飞升指南',
    genre: '科幻 / 赛博朋克',
    wordCount: '12.5万字',
    lastEdited: '10分钟前编辑',
    cover: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)'
  }
]

const defaultWorldview: WorldviewEntry[] = [
  {
    id: 'world-1',
    title: '时代背景',
    content:
      '2077年，第四次企业战争结束后，全球能源被三大寡头公司垄断。下层阶级只能生存在终日下着酸雨的贫民窟，依靠走私二手义体和黑市芯片维持生活。意识上传技术初现端倪，被称为“赛博飞升”。'
  },
  {
    id: 'world-2',
    title: '核心规则：义体排异',
    content:
      '过度植入机械义体会导致神经系统崩溃，引发赛博精神病。唯一能延缓排异反应的药物“神经阻断剂”被公司严格控制，成为比货币更硬通的资源。'
  },
  {
    id: 'world-3',
    title: '地理环境：夜城（Night City）',
    content:
      '建在填海造陆上的超级都市，分为上层的云端区和底层的霓虹区。云端区拥有人造阳光，霓虹区则充满全息广告、酸雨和九龙城寨式建筑群。'
  }
]

const defaultCharacters: CharacterCard[] = [
  {
    id: 'char-1',
    name: '李雷',
    role: '男主',
    avatar: 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)',
    description:
      '常年在底层的义体回收站工作，性格谨慎冷漠，但内心存有底线。右臂是拼装的二手军用义体，隐藏着某种未知的黑客后门。',
    tags: [
      { label: '底层回收者' },
      { label: '机械右臂', tone: 'danger' }
    ]
  },
  {
    id: 'char-2',
    name: '艾达',
    role: 'Ada',
    avatar: 'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)',
    description:
      '荒坂科技前高级研究员，脑内植入了极其危险的记忆锁，掌握着意识上传的核心代码，目前正被全城通缉。',
    tags: [
      { label: '公司叛逃者' },
      { label: '携带机密', tone: 'success' }
    ]
  },
  {
    id: 'char-3',
    name: '“老鬼”',
    role: '',
    avatar: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    description:
      '经营着一家地下诊所，为帮派分子和边缘人提供廉价手术和阻断剂。他是李雷为数不多可以信任的熟人。',
    tags: [
      { label: '黑市医生' },
      { label: '中立', tone: 'warning' }
    ]
  }
]

const defaultOutline: OutlineItem[] = [
  {
    id: 'outline-1',
    title: '第1章：义体回收站的雨夜',
    wordTarget: '3000字',
    conflict: '平凡生活被打破。',
    summary:
      '李雷在回收站关门时，救下了头部受重伤且被追杀的公司女高管艾达。发现她脑内的军用级接口，李雷面临交出她还是藏匿她的抉择。'
  },
  {
    id: 'outline-2',
    title: '第2章：走私芯片',
    wordTarget: '预估 3000字',
    conflict: '公司杀手搜查贫民窟。',
    summary:
      '李雷利用回收站的铅板密室躲避了第一波搜查，并请老鬼来为艾达稳定伤情。老鬼警告李雷惹上了大麻烦。'
  }
]

const defaultChapters: ChapterDraft[] = [
  {
    id: 'chapter-1',
    title: '第1章：义体回收站的雨夜',
    content:
      '酸雨敲打在波纹铁皮屋顶上，发出令人烦躁的白噪音。\n\n李雷靠在生锈的工作台旁，机械右臂发出轻微的伺服电机嗡嗡声。今天晚上的收获糟透了，只有几个劣质的神经插槽，还有一条已经被格式化得干干净净的二手脊柱。\n\n就在他准备拉下卷帘门的时候，巷子尽头传来了一阵急促的脚步声。\n\n“救命……” 一个穿着高档公司制服的女人倒在了水洼里，她的后脑勺上，一个军用级的数据接口正在往外冒着蓝色的电火花。'
  },
  {
    id: 'chapter-2',
    title: '第2章：走私芯片',
    content: ''
  },
  {
    id: 'chapter-3',
    title: '第3章：公司狗的觉醒',
    content: ''
  }
]

const initialMessages: ChatMessage[] = [
  {
    id: 'msg-1',
    role: 'assistant',
    content: '我是你的创作助理。已读取世界观和当前章节内容。需要我帮你润色段落，或者提供剧情建议吗？'
  }
]

const defaultAppSettings: AppSettings = {
  provider: 'deepseek',
  apiKey: 'sk-1234567890abcdef',
  baseUrl: 'https://api.deepseek.com/v1',
  autoSaveInterval: '5m'
}

function loadStoredState(): StoredState {
  if (typeof window === 'undefined') {
    return {
      theme: 'ocean',
      selectedProjectId: defaultProjects[0].id,
      projects: defaultProjects,
      worldviewEntries: defaultWorldview,
      characters: defaultCharacters,
      outlineItems: defaultOutline,
      chapters: defaultChapters,
      appSettings: defaultAppSettings
    }
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return {
      theme: 'ocean',
      selectedProjectId: defaultProjects[0].id,
      projects: defaultProjects,
      worldviewEntries: defaultWorldview,
      characters: defaultCharacters,
      outlineItems: defaultOutline,
      chapters: defaultChapters,
      appSettings: defaultAppSettings
    }
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredState>
    return {
      theme: parsed.theme ?? 'ocean',
      selectedProjectId: parsed.selectedProjectId ?? defaultProjects[0].id,
      projects: parsed.projects ?? defaultProjects,
      worldviewEntries: parsed.worldviewEntries ?? defaultWorldview,
      characters: parsed.characters ?? defaultCharacters,
      outlineItems: parsed.outlineItems ?? defaultOutline,
      chapters: parsed.chapters ?? defaultChapters,
      appSettings: parsed.appSettings ?? defaultAppSettings
    }
  } catch {
    return {
      theme: 'ocean',
      selectedProjectId: defaultProjects[0].id,
      projects: defaultProjects,
      worldviewEntries: defaultWorldview,
      characters: defaultCharacters,
      outlineItems: defaultOutline,
      chapters: defaultChapters,
      appSettings: defaultAppSettings
    }
  }
}

export const useAppStore = defineStore('app', () => {
  const stored = loadStoredState()
  const currentView = ref<'projects' | 'wizard' | 'workbench'>('projects')
  const activePanel = ref<PanelName>('world')
  const aiVisible = ref(true)
  const theme = ref<ThemeName>(stored.theme)
  const selectedProjectId = ref(stored.selectedProjectId)
  const projects = ref<ProjectSummary[]>(stored.projects)
  const worldviewEntries = ref<WorldviewEntry[]>(stored.worldviewEntries)
  const characters = ref<CharacterCard[]>(stored.characters)
  const outlineItems = ref<OutlineItem[]>(stored.outlineItems)
  const chapters = ref<ChapterDraft[]>(stored.chapters)
  const appSettings = ref<AppSettings>(stored.appSettings)
  const messages = ref<ChatMessage[]>(initialMessages)
  const selectedChapterId = ref((stored.chapters[0] ?? defaultChapters[0]).id)

  const selectedChapter = computed(
    () => chapters.value.find((chapter) => chapter.id === selectedChapterId.value) ?? chapters.value[0]
  )
  const currentTheme = computed(() => getThemePreset(theme.value))
  const currentProject = computed(
    () => projects.value.find((project) => project.id === selectedProjectId.value) ?? projects.value[0]
  )

  function setTheme(nextTheme: ThemeName): void {
    theme.value = nextTheme
  }

  function openProject(projectId: string): void {
    const project = projects.value.find((item) => item.id === projectId)
    if (!project) {
      return
    }

    selectedProjectId.value = projectId
    currentView.value = 'workbench'
    activePanel.value = 'world'
  }

  function backToProjects(): void {
    currentView.value = 'projects'
  }

  function openWizard(): void {
    currentView.value = 'wizard'
  }

  function closeWizard(): void {
    currentView.value = 'projects'
  }

  function createProject(payload: { title: string; genre: string; wordCount: string }): void {
    projects.value.unshift({
      id: `project-${Date.now()}`,
      title: payload.title,
      genre: payload.genre,
      wordCount: payload.wordCount,
      lastEdited: '刚刚创建',
      cover: 'linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)'
    })

    selectedProjectId.value = projects.value[0].id
    currentView.value = 'workbench'
    activePanel.value = 'world'
  }

  function setPanel(panel: PanelName): void {
    activePanel.value = panel
  }

  function selectChapter(chapterId: string): void {
    selectedChapterId.value = chapterId
    activePanel.value = 'chapters'
  }

  function updateChapterTitle(value: string): void {
    const chapter = selectedChapter.value
    if (!chapter) {
      return
    }

    chapter.title = value
  }

  function updateChapterContent(value: string): void {
    const chapter = selectedChapter.value
    if (!chapter) {
      return
    }

    chapter.content = value
  }

  function toggleAi(): void {
    aiVisible.value = !aiVisible.value
  }

  function updateAppSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    appSettings.value[key] = value
  }

  function pushUserMessage(content: string): void {
    messages.value.push({
      id: `msg-${Date.now()}`,
      role: 'user',
      content
    })
  }

  function pushAssistantMessage(content: string): void {
    messages.value.push({
      id: `msg-${Date.now()}-assistant`,
      role: 'assistant',
      content
    })
  }

  function insertIntoChapter(content: string): void {
    const chapter = selectedChapter.value
    if (!chapter) {
      return
    }

    chapter.content = `${chapter.content}\n\n${content}`.trim()
  }

  watch(
    [theme, selectedProjectId, projects, worldviewEntries, characters, outlineItems, chapters, appSettings],
    () => {
      if (typeof window === 'undefined') {
        return
      }

      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          theme: theme.value,
          selectedProjectId: selectedProjectId.value,
          projects: projects.value,
          worldviewEntries: worldviewEntries.value,
          characters: characters.value,
          outlineItems: outlineItems.value,
          chapters: chapters.value,
          appSettings: appSettings.value
        } satisfies StoredState)
      )
    },
    { deep: true, immediate: true }
  )

  return {
    activePanel,
    aiVisible,
    appSettings,
    backToProjects,
    chapters,
    characters,
    closeWizard,
    createProject,
    currentTheme,
    currentProject,
    currentView,
    insertIntoChapter,
    messages,
    openProject,
    openWizard,
    outlineItems,
    projects,
    pushAssistantMessage,
    pushUserMessage,
    selectChapter,
    selectedChapter,
    selectedChapterId,
    selectedProjectId,
    setPanel,
    setTheme,
    theme,
    toggleAi,
    updateAppSetting,
    updateChapterContent,
    updateChapterTitle,
    worldviewEntries
  }
})
