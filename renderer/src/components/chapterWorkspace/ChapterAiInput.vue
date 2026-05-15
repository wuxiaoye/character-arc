<script setup lang="ts">
import { ref } from 'vue'
import { ArrowUp } from 'lucide-vue-next'

const props = defineProps<{
  disabled: boolean
}>()

const emit = defineEmits<{
  send: [value: string]
}>()

const text = ref('')

function handleSend(): void {
  const value = text.value.trim()
  if (!value || props.disabled) return
  emit('send', value)
  text.value = ''
}

function handleKey(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <div class="ai-input">
    <div class="wrap" :class="{ disabled }">
      <textarea
        v-model="text"
        :placeholder="disabled ? 'AI 正在生成...' : '向 AI 提问，或描述你想要的修改 (Enter 发送)'"
        :disabled="disabled"
        @keydown="handleKey"
      />
      <button class="send" :disabled="disabled || !text.trim()" @click="handleSend">
        <ArrowUp :size="14" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.ai-input {
  padding: 12px;
  border-top: 1px solid var(--arc-border);
  background: var(--arc-bg-surface);
}

.wrap {
  position: relative;
  border: 1px solid var(--arc-border);
  border-radius: var(--arc-radius-md);
  background: var(--arc-bg-weak);
  transition: 0.15s;
}

.wrap:focus-within {
  border-color: var(--arc-primary);
  background: var(--arc-bg-surface);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--arc-primary) 12%, transparent);
}

.wrap.disabled {
  opacity: 0.6;
}

.wrap textarea {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  padding: 10px 44px 10px 12px;
  font-size: 13px;
  line-height: 1.55;
  resize: none;
  font-family: inherit;
  color: var(--arc-text-primary);
  user-select: text;
  min-height: 64px;
  max-height: 160px;
}

.send {
  position: absolute;
  right: 6px;
  bottom: 6px;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: var(--arc-primary);
  color: white;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.send:hover:not(:disabled) {
  background: var(--arc-primary-hover);
}

.send:disabled {
  background: color-mix(in srgb, var(--arc-text-hint) 60%, transparent);
  cursor: not-allowed;
}
</style>
