<script setup lang="ts">
import { ref } from 'vue'
import { NPopover } from 'naive-ui'
import type { ChapterAssistantQuickAction } from '@/features/ai/chapterAssistantOptions'
import { SendHorizonal, Square } from 'lucide-vue-next'
import AssistantInlineContextSections from './AssistantInlineContextSections.vue'
import type { AiRunKnowledgeItem, AiRunRecord } from '@/types/app'

const draft = defineModel<string>('draft', { required: true })
const responseMode = defineModel<'freeform' | 'polish' | 'continue' | 'suggest' | 'reference'>('responseMode', { required: true })
const responseLength = defineModel<'short' | 'medium' | 'long'>('responseLength', { required: true })

const props = defineProps<{
  isResponding: boolean
  isStopping: boolean
  canRegenerate: boolean
  hasSelection: boolean
  selectedExcerpt: string
  quickActions: ChapterAssistantQuickAction[]
  latestAiRun: AiRunRecord | undefined
  latestAiRunKnowledge: AiRunKnowledgeItem[]
  latestAiRunStatusText: string
}>()

const emit = defineEmits<{
  regenerate: []
  submit: []
  stop: []
  keydown: [event: KeyboardEvent]
  quickAction: [action: ChapterAssistantQuickAction]
}>()

const commandMenuOpen = ref(false)

function handleQuickAction(action: ChapterAssistantQuickAction) {
  commandMenuOpen.value = false
  emit('quickAction', action)
}
</script>

<template>
  <footer class="claude-assistant-composer">
    <div v-if="props.hasSelection" class="claude-assistant-composer__selection claude-assistant-composer__selection--singleline" :title="props.selectedExcerpt">
      <span class="claude-assistant-composer__selection-label">已附加选中文本</span>
      <p>{{ props.selectedExcerpt }}</p>
    </div>

    <div class="claude-assistant-composer__controls">
      <textarea
        v-model="draft"
        class="claude-assistant-composer__input"
        rows="4"
        placeholder="输入消息，或先选一段文字再发起命令。"
        @keydown="(event) => emit('keydown', event)"
      />

      <div class="claude-assistant-composer__footer">
        <div class="claude-assistant-composer__menu-area">
          <NPopover v-model:show="commandMenuOpen" trigger="click" placement="top-start">
            <template #trigger>
              <button type="button" class="claude-assistant-command-trigger">
                <span class="claude-assistant-command-trigger__prefix">/</span>
                <span>命令菜单</span>
              </button>
            </template>

            <div class="claude-assistant-command-popover">
              <AssistantInlineContextSections
                :quick-actions="props.quickActions"
                :selected-excerpt="props.selectedExcerpt"
                :latest-ai-run="props.latestAiRun"
                :latest-ai-run-knowledge="props.latestAiRunKnowledge"
                :latest-ai-run-status-text="props.latestAiRunStatusText"
                :is-responding="props.isResponding"
                command-only
                @quick-action="handleQuickAction"
              />
            </div>
          </NPopover>
          <span class="claude-assistant-composer__hint">Enter 发送，Shift + Enter 换行</span>
        </div>

        <div class="claude-assistant-composer__actions">
          <button type="button" class="claude-assistant-tool-btn" :disabled="props.isResponding || !props.canRegenerate" @click="emit('regenerate')">
            重试
          </button>
          <button
            type="button"
            class="claude-assistant-send-btn"
            :class="{ danger: props.isResponding }"
            :disabled="(!props.isResponding && !draft.trim()) || props.isStopping"
            @click="props.isResponding ? emit('stop') : emit('submit')"
          >
            <component :is="props.isResponding ? Square : SendHorizonal" :size="15" />
            <span>{{ props.isResponding ? (props.isStopping ? '停止中...' : '停止生成') : '发送' }}</span>
          </button>
        </div>
      </div>
    </div>
  </footer>
</template>
