<script setup lang="ts">
import { NButton, NModal } from 'naive-ui'

defineProps<{
  show: boolean
  isGenerating: boolean
  isStopping: boolean
  executionLabel: string
  streamingContent: string
  progressPercent: number
  progressText: string
}>()

defineEmits<{
  stop: []
  close: []
}>()
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    class="draft-modal"
    title="AI 初稿执行中"
    :mask-closable="false"
    :closable="!isGenerating"
    :bordered="false"
    @close="$emit('close')"
  >
    <div class="card">
      <div class="head">
        <div class="copy-block">
          <span class="label">AI 初稿执行中</span>
          <strong>{{ executionLabel || '等待开始' }}</strong>
        </div>
        <span class="percent">
          {{ isGenerating ? `${progressPercent}%` : '已结束' }}
        </span>
      </div>
      <div class="track">
        <div class="fill" :style="{ width: `${progressPercent}%` }" />
      </div>
      <p class="copy">
        {{ progressText || '已停止或完成本次 AI 初稿生成。' }}
      </p>
      <div class="preview arc-scrollbar">
        <pre>{{ streamingContent || 'AI 正在准备本章初稿内容...' }}</pre>
      </div>
    </div>

    <template #footer>
      <div class="actions">
        <n-button
          v-if="isGenerating"
          round
          strong
          secondary
          type="warning"
          :loading="isStopping"
          @click="$emit('stop')"
        >
          停止生成
        </n-button>
        <n-button v-else round strong type="primary" @click="$emit('close')">
          关闭
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.draft-modal :deep(.n-card) {
  width: min(720px, 92vw);
}

.card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.copy-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label {
  font-size: 11px;
  color: var(--arc-text-hint);
  letter-spacing: 0.05em;
}

.copy-block strong {
  font-size: 14px;
  color: var(--arc-text-primary);
}

.percent {
  font-size: 14px;
  font-weight: 600;
  color: var(--arc-primary);
  font-variant-numeric: tabular-nums;
}

.track {
  height: 6px;
  background: var(--arc-bg-surface-hover);
  border-radius: 3px;
  overflow: hidden;
}

.fill {
  height: 100%;
  background: linear-gradient(90deg, var(--arc-success), var(--arc-primary));
  border-radius: 3px;
  transition: width 0.3s ease;
}

.copy {
  margin: 0;
  font-size: 12px;
  color: var(--arc-text-secondary);
  line-height: 1.6;
}

.preview {
  background: var(--arc-bg-weak);
  border: 1px solid var(--arc-border);
  border-radius: var(--arc-radius-md);
  padding: 12px 14px;
  max-height: 320px;
  overflow-y: auto;
}

.preview pre {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  color: var(--arc-text-primary);
  user-select: text;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
