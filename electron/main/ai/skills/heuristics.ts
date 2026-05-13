import type { SkillCategory, SkillCompatibility, SkillManifest, SkillStageId } from './types'
import type { AiTaskName } from '../shared-types'

type HeuristicResult = {
  category: SkillCategory
  compatibility: SkillCompatibility
  compatibilityNote: string
  enabled: boolean
  stages: SkillStageId[]
  tasks: AiTaskName[]
  triggers: string[]
  priority: number
}

export function inferSkillMeta(skillId: string, description: string): HeuristicResult {
  const knownMeta = KNOWN_SKILL_META[skillId]
  if (knownMeta) return knownMeta

  const lowerDesc = description.toLowerCase()
  const lowerSkillId = skillId.toLowerCase()

  if (lowerSkillId.includes('scan') || lowerDesc.includes('市场') || lowerDesc.includes('排行'))
    return buildHeuristic('market', ['reference'], [], ['排行', '市场', '趋势'], true)

  if (lowerSkillId.includes('analyze') || lowerDesc.includes('拆书') || lowerDesc.includes('拆文'))
    return buildHeuristic('analysis', ['reference'], ['reference-style-chunk', 'reference-style-analysis'], ['拆书', '分析', '对标'], true)

  if (lowerSkillId.includes('write') || lowerDesc.includes('写作') || lowerDesc.includes('创作'))
    return buildHeuristic('writing', ['premise', 'setting', 'outline', 'draft'], WRITING_TASKS, ['写正文', '写章节', '大纲', '开书'], true)

  if (lowerSkillId.includes('deslop') || lowerSkillId.includes('polish') || lowerDesc.includes('润色') || lowerDesc.includes('ai味'))
    return buildHeuristic('polish', ['draft'], ['chapter-assistant', 'chapter-first-draft'], ['润色', '去AI味', '降低AI感'], true)

  if (lowerSkillId.includes('cover'))
    return buildHeuristic('cover', [], [], [], false, 'external-only', '当前项目还没有封面生成工作台，此 skill 会作为资料保留。')

  if (lowerSkillId.includes('cdp') || lowerSkillId.includes('browser'))
    return buildHeuristic('tool', [], [], [], false, 'external-only', '当前项目没有浏览器 CDP 执行能力，此 skill 会作为外部工具说明保留。')

  return buildHeuristic('writing', [], [], [], false, 'partial', '已识别为通用 skill，可手动决定是否启用并绑定到对应阶段。')
}

export function buildFullManifest(
  partial: Partial<SkillManifest> | null,
  heuristic: HeuristicResult
): SkillManifest {
  return {
    category: partial?.category ?? heuristic.category,
    tasks: partial?.tasks?.length ? partial.tasks : heuristic.tasks,
    stages: partial?.stages?.length ? partial.stages : heuristic.stages,
    triggers: partial?.triggers?.length ? partial.triggers : heuristic.triggers,
    priority: partial?.priority ?? heuristic.priority,
    references: partial?.references ?? [],
    required: partial?.required ?? false
  }
}

const WRITING_TASKS: AiTaskName[] = [
  'chapter-assistant', 'chapter-first-draft', 'outline-batch', 'outline-chain',
  'chapter-analysis', 'inspiration-pack', 'project-bootstrap',
  'worldview-entry', 'character-card', 'outline-item'
]

const KNOWN_SKILL_META: Record<string, HeuristicResult> = {
  // ===== 市场调研（reference 阶段） =====
  'story-long-scan': buildHeuristic('market', ['reference'], [], ['排行', '市场', '趋势'], true),
  'story-short-scan': buildHeuristic('market', ['reference'], [], ['排行', '市场'], true),

  // ===== 分析拆书（reference 阶段） =====
  'story-long-analyze': buildHeuristic('analysis', ['reference'], ['reference-style-chunk', 'reference-style-analysis'], ['拆书', '分析'], true),
  'story-short-analyze': buildHeuristic('analysis', ['reference'], ['reference-style-chunk', 'reference-style-analysis'], ['拆书', '分析'], true),
  'style-fingerprint': buildHeuristic('analysis', ['reference'], ['reference-deep-analyze', 'style-fingerprint-extract'], ['风格提取', '风格指纹', '风格分析', '作者风格', '文风DNA'], true, 'native', '从样本文本中提取量化风格DNA，覆盖叙事/语言/对话/描写/禁忌/主题六大维度。', 7),

  // ===== 立项/设定（premise + setting 阶段） =====
  'style-fusion': buildHeuristic('writing', ['premise', 'setting'], ['project-bootstrap'], ['风格迁移', '风格融合', '创作指南', '风格映射'], true, 'native', '将风格指纹映射到新作品，生成可执行500+章的融合创作规则集+初始故事状态机。', 7),

  // ===== 大纲（outline 阶段） =====
  'story-blueprint': buildHeuristic('writing', ['outline'], ['outline-batch', 'outline-chain'], ['叙事蓝图', '总纲', '长篇架构', '分卷设计', '里程碑', '伏笔网络'], true, 'native', '为500+章超长篇设计完整叙事操作系统：分卷/里程碑/伏笔/角色弧/节奏/主题。', 7),

  // ===== 写作（draft 阶段，写正文） =====
  'story-long-write': buildHeuristic('writing', ['premise', 'setting', 'outline', 'draft'], WRITING_TASKS, ['写正文', '写章节', '大纲', '开书', '写长篇', '网文'], true, 'native', '适合立项、设定、大纲和正文阶段，作为当前项目的核心写作规则来源。', 6),
  'story-short-write': buildHeuristic('writing', ['premise', 'setting', 'outline', 'draft'], WRITING_TASKS, ['写短篇', '短篇', '创作'], true, 'native', '适合短篇小说的立项和写作阶段。', 6),
  'story-chapter-exec': buildHeuristic('writing', ['draft'], ['chapter-first-draft'], ['批量写作', '续写', '执行写作', '状态续写'], true, 'native', '基于融合指南+世界状态+细纲批量生成章节正文，输出续写包支持循环调用。', 8),

  // ===== 润色（仅 chapter-assistant 触发，不参与 chapter-first-draft） =====
  'story-deslop': buildHeuristic('polish', ['draft'], ['chapter-assistant'], ['润色', '去AI味', '降低AI感'], true, 'native', '适合正文润色与去 AI 味，仅建议在写作阶段启用。', 4),
  'story-chapter-repair': buildHeuristic('polish', ['draft'], ['chapter-assistant', 'chapter-analysis'], ['章节修复', '重写', '诊断', 'OOC', '剧情bug', '风格偏移'], false, 'native', '对问题章节进行深度诊断+外科手术式重写。仅在用户明确要求修复时启用。', 6),
  'humanizer-zh': buildHeuristic('polish', ['draft'], ['chapter-assistant'], ['润色', '人性化', '去AI味'], true, 'native', '中文小说AI内容人性化v2.0：23条禁止模式+148短语替换+105词汇替换+格式规范化。', 5),
  'story-format-tomato': buildHeuristic('polish', ['draft'], [], ['番茄', '排版', '爽文格式', '移动端', '短段落', '番茄小说'], false, 'native', '番茄小说平台移动端排版优化。仅在用户提及番茄/排版时通过 trigger 激活。', 5),

  // ===== 外部工具（不注入 AI 管线） =====
  'story-cover': buildHeuristic('cover', [], [], [], false, 'external-only', '当前项目还没有封面生成工作台，此 skill 会作为资料保留，但不会接入正文链路。'),
  'browser-cdp': buildHeuristic('tool', [], [], [], false, 'external-only', '当前项目没有浏览器 CDP 执行能力，此 skill 会作为外部工具说明保留。')
}

function buildHeuristic(
  category: SkillCategory,
  stages: SkillStageId[],
  tasks: AiTaskName[],
  triggers: string[],
  enabled: boolean,
  compatibility: SkillCompatibility = 'native',
  compatibilityNote: string = '',
  priority: number = 5
): HeuristicResult {
  return { category, compatibility, compatibilityNote, enabled, stages, tasks, triggers, priority }
}
