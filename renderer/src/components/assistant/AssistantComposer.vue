<script setup lang="ts">
import { ref } from 'vue'
import { NButton, NButtonGroup, NPopover, NSelect } from 'naive-ui'
import type { ChapterAssistantQuickAction } from '@/features/ai/chapterAssistantOptions'
import { ArrowUp, Square } from 'lucide-vue-next'
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

const responseModeOptions = [
  { label: '自由写作', value: 'freeform' },
  { label: '润色', value: 'polish' },
  { label: '续写', value: 'continue' },
  { label: '建议', value: 'suggest' },
  { label: '参考', value: 'reference' }
]

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

    <div class="claude-assistant-composer__input-wrap">
      <textarea
        v-model="draft"
        class="claude-assistant-composer__input"
        rows="2"
        placeholder="发送消息..."
        @keydown="(event) => emit('keydown', event)"
      />
      <button
        type="button"
        class="claude-assistant-composer__send"
        :class="{ danger: props.isResponding }"
        :disabled="(!props.isResponding && !draft.trim()) || props.isStopping"
        @click="props.isResponding ? emit('stop') : emit('submit')"
      >
        <component :is="props.isResponding ? Square : ArrowUp" :size="16" />
      </button>
    </div>

    <div class="claude-assistant-composer__bar">
      <div class="claude-assistant-composer__bar-left">
        <NPopover v-model:show="commandMenuOpen" trigger="click" placement="top-start" :show-arrow="false" content-class="claude-assistant-command-popover-shell">
          <template #trigger>
            <button type="button" class="claude-assistant-command-trigger">
              <span class="claude-assistant-command-trigger__prefix">/</span>
              <span>命令</span>
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
        <n-select
          v-model:value="responseMode"
          :options="responseModeOptions"
          size="tiny"
          style="width: 92px;"
          :disabled="props.isResponding"
        />
        <n-button-group size="tiny">
          <n-button
            :type="responseLength === 'short' ? 'primary' : 'default'"
            :disabled="props.isResponding"
            @click="responseLength = 'short'"
          >短</n-button>
          <n-button
            :type="responseLength === 'medium' ? 'primary' : 'default'"
            :disabled="props.isResponding"
            @click="responseLength = 'medium'"
          >中</n-button>
          <n-button
            :type="responseLength === 'long' ? 'primary' : 'default'"
            :disabled="props.isResponding"
            @click="responseLength = 'long'"
          >长</n-button>
        </n-button-group>
      </div>
      <button
        type="button"
        class="claude-assistant-tool-btn"
        :disabled="props.isResponding || !props.canRegenerate"
        @click="emit('regenerate')"
      >
        重试
      </button>
    </div>
  </footer>
</template>
