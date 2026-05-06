<script setup lang="ts">
import { ArrowDownToLine } from 'lucide-vue-next'
import { NDropdown } from 'naive-ui'
import { MORE_ACTION_OPTIONS, type AssistantMessageActionKey } from '@/features/assistant/useAssistantSession'
import type { ChatMessage } from '@/types/app'

const props = defineProps<{
  messages: ChatMessage[]
  isResponding: boolean
  streamingReply: string
  renderMarkdown: (content: string) => string
}>()

const emit = defineEmits<{
  insert: [content: string]
  moreAction: [key: string, content: string]
}>()
</script>

<template>
  <div class="claude-assistant-conversation arc-scrollbar">
    <div class="claude-assistant-conversation__stack">
      <article
        v-for="messageItem in props.messages"
        :key="messageItem.id"
        class="claude-assistant-message"
        :class="`claude-assistant-message--${messageItem.role}`"
      >
        <div class="claude-assistant-message__meta">
          <span>{{ messageItem.role === 'assistant' ? '小说助理' : '你' }}</span>
          <div v-if="messageItem.role === 'assistant'" class="claude-assistant-message__actions">
            <button type="button" class="claude-assistant-inline-btn" @click="emit('insert', messageItem.content)">
              <ArrowDownToLine :size="13" />
              <span>插入</span>
            </button>
            <NDropdown
              trigger="click"
              placement="bottom-end"
              :options="MORE_ACTION_OPTIONS"
              @select="(key) => emit('moreAction', String(key), messageItem.content)"
            >
              <button type="button" class="claude-assistant-icon-btn" title="更多操作">···</button>
            </NDropdown>
          </div>
        </div>

        <div
          v-if="messageItem.role === 'assistant'"
          class="claude-assistant-message__body"
          v-html="props.renderMarkdown(messageItem.content)"
        />
        <p v-else class="claude-assistant-message__plain">{{ messageItem.content }}</p>
      </article>

      <article v-if="props.isResponding" class="claude-assistant-message claude-assistant-message--assistant claude-assistant-message--pending">
        <div class="claude-assistant-message__meta">
          <span>小说助理</span>
        </div>
        <div
          class="claude-assistant-message__body"
          v-html="props.streamingReply ? props.renderMarkdown(props.streamingReply) : '正在整理当前章节上下文并生成回复...'"
        />
      </article>
    </div>
  </div>
</template>
