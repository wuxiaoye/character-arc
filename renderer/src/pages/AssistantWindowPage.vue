<script setup lang="ts">
import { computed } from 'vue'
import ClaudeAssistantSurface from '@/components/assistant/ClaudeAssistantSurface.vue'
import AssistantEmptyState from '@/components/assistant/AssistantEmptyState.vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const hasChapterContext = computed(() => Boolean(appStore.currentProject && appStore.selectedChapter))
</script>

<template>
  <section class="assistant-window-page claude-assistant-window-page">
    <div v-if="hasChapterContext" class="claude-assistant-window-frame">
      <ClaudeAssistantSurface />
    </div>
    <div v-else class="claude-assistant-window-frame claude-assistant-window-frame--empty">
      <AssistantEmptyState />
    </div>
  </section>
</template>
