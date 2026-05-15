<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronRight, Folder, FocusIcon, History, Menu, Minus, Plus, Sparkles } from 'lucide-vue-next'
import { NTag, NTooltip } from 'naive-ui'
import SimpleChapterEditor from './SimpleChapterEditor.vue'
import ChapterVersionDialog from './ChapterVersionDialog.vue'
import { getChapterCharacterCount } from '@/features/chapters/editorContent'
import { formatChapterWordTargetLabel, parseChapterWordTarget } from '@/features/chapters/wordTarget'
import { formatVolumeLabel } from '@/features/workspace/outlineVolumes'
import { useAppStore } from '@/stores/app'

defineProps<{
  aiOpen: boolean
  focusMode: boolean
  showSidebarToggle?: boolean
}>()

const emit = defineEmits<{
  toggleAi: []
  toggleFocus: []
  toggleSidebar: []
}>()

const appStore = useAppStore()

const FONT_LEVELS = [14, 15, 16, 17, 18, 20, 22]
const fontIdx = ref(3)
const fontSize = computed(() => FONT_LEVELS[fontIdx.value])
const versionDialogVisible = ref(false)

function stepFont(delta: number): void {
  const next = Math.max(0, Math.min(FONT_LEVELS.length - 1, fontIdx.value + delta))
  fontIdx.value = next
}

const currentChapter = computed(() => appStore.selectedChapter)
const currentVolume = computed(() => appStore.selectedChapterVolume)
const currentVolumeIndex = computed(() =>
  appStore.outlineVolumes.findIndex((v) => v.id === currentVolume.value?.id)
)
const volumeLabel = computed(() =>
  currentVolume.value
    ? formatVolumeLabel(currentVolume.value, Math.max(currentVolumeIndex.value, 0), 'compact')
    : '未分卷'
)

const wordCount = computed(() => getChapterCharacterCount(currentChapter.value?.content ?? ''))
const targetWords = computed(() => parseChapterWordTarget(currentChapter.value?.wordTarget))
const progressPercent = computed(() => {
  if (!targetWords.value) return 0
  return Math.min(100, Math.round((wordCount.value / targetWords.value) * 100))
})

const saveStatusText = computed(() => {
  if (appStore.isPersistencePending) {
    return appStore.isLiveAutoSave ? '排队保存' : '自动保存中'
  }
  return '已保存'
})

const chapterIndex = computed(() => {
  const i = appStore.chapters.findIndex((c) => c.id === currentChapter.value?.id)
  return i >= 0 ? i + 1 : 1
})
</script>

<template>
  <main class="editor-pane">
    <header v-if="!focusMode" class="ep-header">
      <button v-if="showSidebarToggle" class="toolbtn sidebar-toggle" @click="emit('toggleSidebar')">
        <Menu :size="14" />
      </button>
      <div class="breadcrumb">
        <Folder :size="13" />
        <span>{{ volumeLabel }}</span>
        <ChevronRight :size="12" />
        <span class="crumb-current">{{ currentChapter?.title || '未命名章节' }}</span>
      </div>

      <div class="ep-actions">
        <span class="save-indicator">
          <span class="dot" :class="{ pending: appStore.isPersistencePending }" />
          {{ saveStatusText }}
        </span>
        <span class="divider" />

        <div class="font-stepper">
          <button @click="stepFont(-1)"><Minus :size="11" /></button>
          <span class="level">{{ fontSize }}px</span>
          <button @click="stepFont(1)"><Plus :size="11" /></button>
        </div>

        <n-tooltip>
          <template #trigger>
            <button class="toolbtn" @click="emit('toggleFocus')"><FocusIcon :size="13" /></button>
          </template>
          专注模式 (F11)
        </n-tooltip>
        <n-tooltip>
          <template #trigger>
            <button class="toolbtn" :disabled="!currentChapter" @click="versionDialogVisible = true">
              <History :size="13" />
            </button>
          </template>
          历史版本
        </n-tooltip>
        <button class="toolbtn primary" @click="emit('toggleAi')">
          <Sparkles :size="13" />
          <span>AI 助理</span>
        </button>
      </div>
    </header>

    <div class="ep-scroll arc-scrollbar">
      <div class="ep-canvas" :style="{ fontSize: fontSize + 'px' }">
        <div v-if="!currentChapter" class="ep-empty">
          请在左侧选择一个章节，或新建一个章节开始写作
        </div>
        <template v-else>
          <div class="ep-meta-row">
            <n-tag size="small" :bordered="false">{{ wordCount.toLocaleString() }} 字</n-tag>
            <n-tag size="small" :bordered="false">目标 {{ formatChapterWordTargetLabel(currentChapter.wordTarget) }}</n-tag>
            <span v-if="currentChapter.summary" class="meta-summary">大纲：{{ currentChapter.summary }}</span>
          </div>

          <SimpleChapterEditor
            class="ep-editor"
            :chapter-id="currentChapter.id"
            :model-value="currentChapter.content ?? ''"
            :insertion-request="appStore.pendingChapterInsertion"
            @update:model-value="appStore.updateChapterContent"
            @consume-insertion="appStore.consumeChapterInsertion"
            @selection-change="appStore.updateChapterSelection"
          />
        </template>
      </div>
    </div>

    <footer v-if="!focusMode && currentChapter" class="ep-status">
      <div class="stats-group">
        <span>字数 {{ wordCount.toLocaleString() }}</span>
        <span>第 {{ chapterIndex }} / {{ appStore.chapters.length }} 章</span>
      </div>
      <div class="progress-block">
        <span class="progress-label">本章目标 {{ targetWords.toLocaleString() }}</span>
        <div class="progress-bar">
          <div class="fill" :style="{ width: Math.min(100, progressPercent) + '%' }" />
        </div>
        <span class="progress-pct">{{ progressPercent }}%</span>
      </div>
    </footer>

    <ChapterVersionDialog
      v-model:show="versionDialogVisible"
      :chapter="currentChapter ?? null"
    />
  </main>
</template>

<style scoped>
.editor-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  background: var(--arc-bg-body);
  overflow: hidden;
}

.ep-header {
  height: 44px;
  flex-shrink: 0;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--arc-bg-surface);
  border-bottom: 1px solid var(--arc-border);
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--arc-text-secondary);
  min-width: 0;
}

.breadcrumb svg {
  flex-shrink: 0;
  color: var(--arc-text-hint);
}

.crumb-current {
  color: var(--arc-text-primary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ep-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.save-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--arc-text-hint);
}

.save-indicator .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--arc-success);
}

.save-indicator .dot.pending {
  background: var(--arc-warning);
}

.divider {
  width: 1px;
  height: 18px;
  background: var(--arc-border);
  margin: 0 4px;
}

.font-stepper {
  display: inline-flex;
  align-items: center;
  background: var(--arc-bg-surface-hover);
  border-radius: var(--arc-radius-sm);
  padding: 2px;
  gap: 2px;
}

.font-stepper button {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--arc-text-secondary);
  cursor: pointer;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.font-stepper button:hover {
  background: var(--arc-bg-surface);
  color: var(--arc-text-primary);
}

.font-stepper .level {
  font-size: 11px;
  color: var(--arc-text-secondary);
  padding: 0 4px;
  min-width: 30px;
  text-align: center;
}

.toolbtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: var(--arc-radius-sm);
  border: none;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  color: var(--arc-text-secondary);
  background: transparent;
  transition: 0.15s;
}

.toolbtn:hover {
  background: var(--arc-bg-surface-hover);
  color: var(--arc-text-primary);
}

.toolbtn.primary {
  background: var(--arc-primary-soft);
  color: var(--arc-primary);
}

.toolbtn.primary:hover {
  background: color-mix(in srgb, var(--arc-primary) 14%, var(--arc-bg-surface));
}

.ep-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 32px 0 64px;
  min-height: 0;
}

.ep-canvas {
  max-width: 760px;
  margin: 0 auto;
  padding: 0 48px;
}

.ep-meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
  font-size: 12px;
  color: var(--arc-text-secondary);
  flex-wrap: wrap;
}

.meta-summary {
  color: var(--arc-text-hint);
  font-size: 12px;
}

.ep-editor {
  background: transparent;
}

.ep-empty {
  text-align: center;
  padding: 80px 0;
  color: var(--arc-text-hint);
  font-size: 14px;
}

.ep-status {
  height: 32px;
  flex-shrink: 0;
  padding: 0 16px;
  background: var(--arc-bg-surface);
  border-top: 1px solid var(--arc-border);
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 11px;
  color: var(--arc-text-hint);
}

.stats-group {
  display: flex;
  gap: 12px;
}

.progress-block {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 120px;
}

.progress-label {
  color: var(--arc-text-secondary);
  white-space: nowrap;
}

.progress-bar {
  flex: 1;
  height: 4px;
  background: var(--arc-bg-surface-hover);
  border-radius: 2px;
  overflow: hidden;
}

.progress-bar .fill {
  height: 100%;
  background: linear-gradient(90deg, var(--arc-success), var(--arc-primary));
  border-radius: 2px;
  transition: width 0.3s ease;
}

.progress-pct {
  color: var(--arc-text-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
