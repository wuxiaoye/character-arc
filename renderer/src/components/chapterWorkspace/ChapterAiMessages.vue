<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { ArrowDown, Copy, Replace } from 'lucide-vue-next'
import { useMessage } from 'naive-ui'
import type { ChapterAiMessage } from './useChapterAi'

const props = defineProps<{
  messages: ChapterAiMessage[]
  isResponding: boolean
  hasSelection: boolean
}>()

const emit = defineEmits<{
  apply: [content: string, mode: 'cursor' | 'append' | 'replace-selection']
}>()

const message = useMessage()
const scrollRef = ref<HTMLDivElement | null>(null)

watch(
  () => [props.messages.length, props.isResponding] as const,
  () => nextTick(() => {
    if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight
  })
)

async function copyMessage(content: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(content)
    message.success('已复制')
  } catch {
    message.error('复制失败')
  }
}
</script>

<template>
  <div ref="scrollRef" class="messages arc-scrollbar">
    <div v-if="!messages.length && !isResponding" class="empty">
      问问 AI 怎么写下一段、改写当前段落，或基于大纲给建议。
    </div>

    <div v-for="msg in messages" :key="msg.id" class="msg" :class="msg.role">
      <div class="bubble">{{ msg.content }}</div>
      <div v-if="msg.role === 'assistant'" class="actions">
        <button
          v-if="hasSelection"
          class="mini primary"
          title="替换当前选区"
          @click="emit('apply', msg.content, 'replace-selection')"
        >
          <Replace :size="11" /> 替换选区
        </button>
        <button
          class="mini"
          title="插入到光标处"
          @click="emit('apply', msg.content, 'cursor')"
        >
          <ArrowDown :size="11" /> 插入光标
        </button>
        <button class="mini" title="复制" @click="copyMessage(msg.content)">
          <Copy :size="11" />
        </button>
      </div>
    </div>

    <div v-if="isResponding" class="msg assistant">
      <div class="bubble typing">
        <span class="dot" />
        <span class="dot" />
        <span class="dot" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.empty {
  margin: auto;
  text-align: center;
  font-size: 12px;
  color: var(--arc-text-hint);
  max-width: 220px;
  line-height: 1.6;
}

.msg {
  display: flex;
  flex-direction: column;
  gap: 6px;
  user-select: text;
}

.msg.user { align-items: flex-end; }
.msg.assistant { align-items: flex-start; }

.bubble {
  max-width: 95%;
  padding: 10px 14px;
  border-radius: var(--arc-radius-md);
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

.msg.user .bubble {
  background: var(--arc-primary);
  color: white;
  border-bottom-right-radius: 4px;
}

.msg.assistant .bubble {
  background: var(--arc-bg-surface-hover);
  color: var(--arc-text-primary);
  border-bottom-left-radius: 4px;
}

.bubble.typing {
  display: inline-flex;
  gap: 4px;
  padding: 12px 16px;
}

.bubble.typing .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--arc-text-hint);
  animation: bounce 1.2s infinite;
}

.bubble.typing .dot:nth-child(2) { animation-delay: 0.15s; }
.bubble.typing .dot:nth-child(3) { animation-delay: 0.3s; }

@keyframes bounce {
  0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-3px); }
}

.actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.mini {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  border: 1px solid var(--arc-border);
  border-radius: 12px;
  background: var(--arc-bg-surface);
  font-size: 11px;
  color: var(--arc-text-secondary);
  cursor: pointer;
  transition: 0.15s;
}

.mini:hover {
  border-color: var(--arc-primary);
  color: var(--arc-primary);
}

.mini.primary {
  background: var(--arc-primary);
  color: white;
  border-color: var(--arc-primary);
}

.mini.primary:hover {
  background: var(--arc-primary-hover);
  color: white;
}
</style>
