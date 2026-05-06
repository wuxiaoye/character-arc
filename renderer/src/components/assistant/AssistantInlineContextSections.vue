<script setup lang="ts">
import { computed } from 'vue'
import type { ChapterAssistantQuickAction } from '@/features/ai/chapterAssistantOptions'
import type { AiRunKnowledgeItem, AiRunRecord } from '@/types/app'
import { chapterAssistantQuickActionGroups } from '@/features/ai/chapterAssistantOptions'

const props = defineProps<{
  quickActions: ChapterAssistantQuickAction[]
  selectedExcerpt: string
  latestAiRun: AiRunRecord | undefined
  latestAiRunKnowledge: AiRunKnowledgeItem[]
  latestAiRunStatusText: string
  isResponding: boolean
  commandOnly?: boolean
}>()

const emit = defineEmits<{
  quickAction: [action: ChapterAssistantQuickAction]
}>()

const groupedQuickActions = computed(() =>
  chapterAssistantQuickActionGroups
    .map((group) => ({
      ...group,
      items: props.quickActions.filter((action) => action.group === group.key)
    }))
    .filter((group) => group.items.length > 0)
)
</script>

<template>
  <section class="claude-assistant-context arc-scrollbar" :class="{ 'claude-assistant-context--commands': props.commandOnly }">
    <template v-if="props.commandOnly">
      <div class="claude-assistant-context__section claude-assistant-context__section--commands">
        <div class="claude-assistant-context__head claude-assistant-context__head--commands">
          <strong>命令菜单</strong>
          <span>像 Claude Code 一样，用命令直接触发创作动作。</span>
        </div>

        <div class="claude-assistant-command-groups">
          <section v-for="group in groupedQuickActions" :key="group.key" class="claude-assistant-command-group">
            <header class="claude-assistant-command-group__head">
              <strong>{{ group.label }}</strong>
              <span>{{ group.description }}</span>
            </header>

            <div class="claude-assistant-command-list">
              <button
                v-for="action in group.items"
                :key="action.id"
                type="button"
                class="claude-assistant-command-item"
                :disabled="props.isResponding || (action.requiresSelection && !props.selectedExcerpt)"
                :title="action.requiresSelection && !props.selectedExcerpt ? '请先在正文中选中内容' : action.prompt"
                @click="emit('quickAction', action)"
              >
                <span class="claude-assistant-command-item__prefix">/</span>
                <component :is="action.icon" :size="13" class="claude-assistant-command-item__icon" />
                <span class="claude-assistant-command-item__body">
                  <strong>{{ action.label }}</strong>
                  <span>{{ action.requiresSelection ? '需要选区' : '直接执行' }}</span>
                </span>
                <span class="claude-assistant-command-item__meta">{{ group.label }}</span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </template>

    <template v-else>
      <section v-if="props.latestAiRun" class="claude-assistant-context__section">
        <div class="claude-assistant-context__head">
          <strong>最近一次运行</strong>
          <span>{{ props.latestAiRunStatusText }}</span>
        </div>
        <div class="claude-assistant-run-meta">
          <span>{{ props.latestAiRun.model }}</span>
          <span v-if="props.latestAiRun.durationMs">{{ Math.max(1, Math.round(props.latestAiRun.durationMs / 100) / 10) }}s</span>
          <span v-if="props.latestAiRun.repairTriggered">已触发修复</span>
        </div>
        <p v-if="props.latestAiRun.error" class="claude-assistant-run-error">{{ props.latestAiRun.error }}</p>

        <div v-if="props.latestAiRunKnowledge.length" class="claude-assistant-knowledge-list">
          <article v-for="item in props.latestAiRunKnowledge" :key="`${props.latestAiRun.id}-${item.documentId}`" class="claude-assistant-knowledge-item">
            <div class="claude-assistant-knowledge-item__title">
              <strong>{{ item.title }}</strong>
              <span>{{ item.sourceLabel || item.sourceType }}</span>
            </div>
            <p>{{ item.snippet }}</p>
            <div v-if="item.keywords.length" class="claude-assistant-tag-row">
              <span v-for="keyword in item.keywords" :key="keyword">{{ keyword }}</span>
            </div>
          </article>
        </div>
        <p v-else class="claude-assistant-empty-copy">这次回复没有命中额外知识片段。</p>
      </section>
    </template>
  </section>
</template>
