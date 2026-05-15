<script setup lang="ts">
import { FileEdit, FileText, GitBranch, Lightbulb, Sparkles } from 'lucide-vue-next'
import { NDropdown } from 'naive-ui'
import type { DropdownOption } from 'naive-ui'
import { CHAPTER_INSPIRATION_FOCUSES, type ChapterInspirationFocus } from './useChapterInspiration'

defineProps<{
  isDraftRunning: boolean
  isDetectRunning: boolean
  isSummaryRunning: boolean
  isInspirationRunning: boolean
  isHumanizeRunning: boolean
  hasSelection: boolean
}>()

const emit = defineEmits<{
  draft: []
  detect: []
  summary: []
  inspiration: [focus: ChapterInspirationFocus]
  humanize: []
}>()

const inspirationOptions: DropdownOption[] = CHAPTER_INSPIRATION_FOCUSES.map((focus) => ({
  label: focus,
  key: focus
}))

function handleInspirationSelect(key: string | number): void {
  emit('inspiration', key as ChapterInspirationFocus)
}
</script>

<template>
  <div class="quick-actions">
    <button class="qa" :disabled="isDraftRunning" @click="$emit('draft')">
      <FileEdit :size="13" />
      <span>{{ isDraftRunning ? '生成中…' : '首发草稿' }}</span>
    </button>
    <button class="qa" :disabled="isDetectRunning" @click="$emit('detect')">
      <GitBranch :size="13" />
      <span>{{ isDetectRunning ? '识别中…' : '伏笔识别' }}</span>
    </button>
    <button class="qa" :disabled="isSummaryRunning" @click="$emit('summary')">
      <FileText :size="13" />
      <span>{{ isSummaryRunning ? '生成中…' : '章节摘要' }}</span>
    </button>
    <n-dropdown
      :options="inspirationOptions"
      placement="bottom-start"
      :disabled="isInspirationRunning"
      @select="handleInspirationSelect"
    >
      <button class="qa" :disabled="isInspirationRunning">
        <Lightbulb :size="13" />
        <span>{{ isInspirationRunning ? '生成中…' : '本章灵感' }}</span>
      </button>
    </n-dropdown>
    <button
      class="qa"
      :disabled="isHumanizeRunning || !hasSelection"
      :title="hasSelection ? '降低选区的 AI 感' : '请先在正文中选中要处理的段落'"
      @click="$emit('humanize')"
    >
      <Sparkles :size="13" />
      <span>{{ isHumanizeRunning ? '处理中…' : '降低 AI 感' }}</span>
    </button>
  </div>
</template>

<style scoped>
.quick-actions {
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--arc-border);
  background: var(--arc-bg-weak);
  flex-wrap: wrap;
}

.qa {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: 1px solid var(--arc-border);
  border-radius: 14px;
  background: var(--arc-bg-surface);
  font-size: 12px;
  color: var(--arc-text-secondary);
  cursor: pointer;
  transition: 0.15s;
}

.qa:hover:not(:disabled) {
  border-color: var(--arc-primary);
  color: var(--arc-primary);
}

.qa:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
