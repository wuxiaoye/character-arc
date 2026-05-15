<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Minimize } from 'lucide-vue-next'
import { NDrawer, NDrawerContent } from 'naive-ui'
import ChapterTreeSidebar from './ChapterTreeSidebar.vue'
import ChapterEditorPane from './ChapterEditorPane.vue'
import ChapterAiPanel from './ChapterAiPanel.vue'

const COMPACT_BREAKPOINT = 1180

const aiOpen = ref(true)
const focusMode = ref(false)
const sidebarDrawerVisible = ref(false)
const viewportWidth = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)
const isCompact = computed(() => viewportWidth.value <= COMPACT_BREAKPOINT)

function toggleAi(): void {
  aiOpen.value = !aiOpen.value
}

function toggleFocus(): void {
  focusMode.value = !focusMode.value
}

function toggleSidebar(): void {
  sidebarDrawerVisible.value = !sidebarDrawerVisible.value
}

function syncViewport(): void {
  viewportWidth.value = window.innerWidth
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'F11') {
    event.preventDefault()
    toggleFocus()
    return
  }
  if (event.key === 'Escape' && focusMode.value) {
    toggleFocus()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', syncViewport)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', syncViewport)
})
</script>

<template>
  <section
    class="chapter-workspace"
    :class="{ 'ai-open': aiOpen, focus: focusMode, compact: isCompact }"
  >
    <ChapterTreeSidebar v-if="!focusMode && !isCompact" class="ws-sidebar" />
    <ChapterEditorPane
      class="ws-editor"
      :ai-open="aiOpen"
      :focus-mode="focusMode"
      :show-sidebar-toggle="!focusMode && isCompact"
      @toggle-ai="toggleAi"
      @toggle-focus="toggleFocus"
      @toggle-sidebar="toggleSidebar"
    />
    <ChapterAiPanel v-if="aiOpen" class="ws-ai" @close="aiOpen = false" />
    <button v-if="focusMode" class="focus-exit" @click="toggleFocus">
      <Minimize :size="13" />
      <span>退出专注 (Esc)</span>
    </button>

    <n-drawer
      v-model:show="sidebarDrawerVisible"
      :width="300"
      placement="left"
      :auto-focus="false"
    >
      <n-drawer-content body-content-style="padding: 0;" :native-scrollbar="false">
        <ChapterTreeSidebar @navigate="sidebarDrawerVisible = false" />
      </n-drawer-content>
    </n-drawer>
  </section>
</template>

<style scoped>
.chapter-workspace {
  display: grid;
  grid-template-columns: 280px 1fr;
  height: 100%;
  width: 100%;
  background: var(--arc-bg-body);
  overflow: hidden;
  min-height: 0;
  min-width: 0;
}

.chapter-workspace.ai-open {
  grid-template-columns: 280px 1fr 380px;
}

.chapter-workspace.focus {
  grid-template-columns: 1fr;
}

.chapter-workspace.focus.ai-open {
  grid-template-columns: 1fr 380px;
}

.chapter-workspace.compact {
  grid-template-columns: 1fr;
}

.chapter-workspace.compact.ai-open {
  grid-template-columns: 1fr 320px;
}

.ws-sidebar,
.ws-editor,
.ws-ai {
  min-width: 0;
  min-height: 0;
}

.focus-exit {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 100;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--arc-bg-surface);
  border: 1px solid var(--arc-border);
  border-radius: 999px;
  font-size: 12px;
  color: var(--arc-text-secondary);
  cursor: pointer;
  box-shadow: var(--arc-shadow-sm);
}

.focus-exit:hover {
  color: var(--arc-text-primary);
}
</style>
