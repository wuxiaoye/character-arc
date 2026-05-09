<script setup lang="ts">
import { Bot } from 'lucide-vue-next'

const props = defineProps<{
  projectTitle: string
  chapterTitle: string
}>()
</script>

<template>
  <header class="claude-assistant-topbar">
    <div class="claude-assistant-topbar__identity">
      <div class="claude-assistant-topbar__icon">
        <Bot :size="14" />
      </div>
      <div class="claude-assistant-topbar__copy">
        <strong>小说助理</strong>
        <span class="claude-assistant-topbar__eyebrow">对话与命令</span>
      </div>
    </div>

    <div class="claude-assistant-topbar__pills">
      <span class="claude-assistant-pill">{{ props.projectTitle }}</span>
      <span class="claude-assistant-pill claude-assistant-pill--strong">{{ props.chapterTitle }}</span>
    </div>
  </header>
</template>
