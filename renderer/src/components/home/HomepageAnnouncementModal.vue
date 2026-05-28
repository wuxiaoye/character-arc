<script setup lang="ts">
import { computed, ref } from 'vue'
import { NButton, NModal, NSpin, NTimeline, NTimelineItem } from 'naive-ui'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
}>()

type AnnouncementItem = {
  title: string
  date: string
  type: 'success' | 'info' | 'warning' | 'error'
  items: string[]
}

const LOCAL_ANNOUNCEMENTS: AnnouncementItem[] = [
  {
    title: '弧光 v1.5.0 发布',
    date: '2026-05-28',
    type: 'success',
    items: [
      '修复 AI 助手历史会话保存后重启丢失的问题',
      '补全多套 AI 接口配置持久化，重启后不再只剩一个配置',
      '修复设置界面修改“配置名称”后保存按钮无法点击的问题',
      '优化设置与工作区保存链路，降低静默保存失败概率'
    ]
  },
  {
    title: '弧光 v1.0.1 发布',
    date: '2026-05-25',
    type: 'success',
    items: [
      '修复 Anthropic 中转站兼容性问题',
      '简化 AI 接口配置流程',
      '修复 macOS 标题栏兼容性'
    ]
  },
  {
    title: '弧光 v1.0.0 正式发布',
    date: '2026-05-24',
    type: 'info',
    items: [
      'AI 辅助小说创作工作台',
      '世界观 / 人物 / 大纲 / 章节全流程管理',
      '拆书知识库与风格仿写',
      '封面生成工作台'
    ]
  }
]

const REMOTE_URL = 'https://raw.githubusercontent.com/uu201/character-arc/main/announcements.json'

const currentVersion = computed(() => window.characterArc.version)
const announcements = ref<AnnouncementItem[]>(LOCAL_ANNOUNCEMENTS)
const loading = ref(false)
const isRemote = ref(false)

async function fetchRemote(): Promise<void> {
  loading.value = true
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(REMOTE_URL, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return
    const data = await res.json() as AnnouncementItem[]
    if (Array.isArray(data) && data.length > 0) {
      announcements.value = data
      isRemote.value = true
    }
  } catch {
    // 网络失败，保持本地数据
  } finally {
    loading.value = false
  }
}

function handleAfterEnter(): void {
  if (!isRemote.value) {
    fetchRemote()
  }
}
</script>

<template>
  <n-modal
    :show="props.show"
    preset="card"
    class="arc-editor-modal"
    title="公告"
    :bordered="false"
    @close="emit('update:show', false)"
    @after-enter="handleAfterEnter"
  >
    <div class="announcement-body">
      <div class="announcement-version">
        当前版本：v{{ currentVersion }}
        <n-spin v-if="loading" :size="14" class="announcement-spin" />
      </div>

      <n-timeline>
        <n-timeline-item
          v-for="(item, index) in announcements"
          :key="index"
          :type="item.type"
          :title="item.title"
          :time="item.date"
        >
          <ul class="announcement-list">
            <li v-for="(line, i) in item.items" :key="i">{{ line }}</li>
          </ul>
        </n-timeline-item>
      </n-timeline>
    </div>

    <template #footer>
      <div class="arc-modal-actions">
        <n-button round strong @click="emit('update:show', false)">关闭</n-button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.announcement-body {
  min-height: 100px;
}

.announcement-version {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--arc-bg-weak);
  color: var(--arc-text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.announcement-spin {
  margin-left: auto;
}

.announcement-list {
  margin: 4px 0 0;
  padding-left: 18px;
  color: var(--arc-text-secondary);
  font-size: 13px;
  line-height: 1.8;
}

.announcement-list li {
  margin-bottom: 2px;
}
</style>
