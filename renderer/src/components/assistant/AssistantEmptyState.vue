<script setup lang="ts">
import { Bot } from 'lucide-vue-next'
</script>

<template>
  <section class="claude-assistant-empty">
    <div class="claude-assistant-empty__badge">
      <Bot :size="18" />
    </div>
    <strong>等待章节上下文</strong>
    <p>请先在主窗口进入章节创作页并选中章节，再使用小说助理。</p>
  </section>
</template>
