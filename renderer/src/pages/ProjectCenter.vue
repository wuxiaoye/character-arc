<script setup lang="ts">
import { computed, h } from 'vue'
import { BookOpen, Clock, MoreHorizontal, Plus, Trash2 } from 'lucide-vue-next'
import { NDropdown, useDialog } from 'naive-ui'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const dialog = useDialog()

const canDeleteProject = computed(() => appStore.projects.length > 1)

const projectMenuOptions = computed(() => [
  {
    key: 'open',
    label: '打开项目'
  },
  {
    key: 'divider',
    type: 'divider'
  },
  {
    key: 'delete',
    label: () => h('span', { class: 'project-menu-danger-label' }, '删除项目'),
    disabled: !canDeleteProject.value
  }
])

function renderMenuIcon(option: { key?: string | number }) {
  if (option.key === 'open') {
    return h(BookOpen, { size: 16 })
  }
  if (option.key === 'delete') {
    return h(Trash2, { size: 16, class: 'project-menu-danger-label' })
  }
  return null
}

function handleMenuSelect(action: string | number, projectId: string): void {
  if (action === 'open') {
    appStore.openProject(projectId)
    return
  }

  if (action === 'delete') {
    requestDeleteProject(projectId)
  }
}

function requestDeleteProject(projectId: string): void {
  const project = appStore.projects.find((item) => item.id === projectId)
  if (!project) {
    return
  }

  dialog.warning({
    title: '确认删除项目',
    content: `确定要删除“${project.title}”吗？删除后当前本地项目数据将无法恢复。`,
    positiveText: '确认删除',
    negativeText: '取消',
    autoFocus: false,
    closable: false,
    onPositiveClick: () => {
      appStore.deleteProject(projectId)
    }
  })
}
</script>

<template>
  <section class="project-center">
    <div class="project-shell">
      <header class="hero arc-drag-region">
        <div>
          <h1>我的作品</h1>
          <p>开启一段新的创作旅程</p>
        </div>

        <button class="create-button arc-no-drag" @click="appStore.openWizard()">
          <Plus :size="18" />
          <span>新建作品</span>
        </button>
      </header>

      <div class="project-grid">
        <article
          v-for="(project, index) in appStore.projects"
          :key="project.id"
          class="project-card"
          :style="{ animationDelay: `${index * 80}ms` }"
          @click="appStore.openProject(project.id)"
        >
          <div class="project-glow" :style="{ background: project.cover }"></div>

          <div class="project-card-top">
            <div class="project-icon" :style="{ background: project.cover }">
              <BookOpen :size="26" />
            </div>
            <n-dropdown
              trigger="click"
              :options="projectMenuOptions"
              :render-icon="renderMenuIcon"
              placement="bottom-end"
              size="large"
              @select="(key) => handleMenuSelect(key, project.id)"
            >
              <button class="more-button" @click.stop>
                <MoreHorizontal :size="18" />
              </button>
            </n-dropdown>
          </div>

          <div class="project-card-bottom">
            <span class="project-genre">{{ project.genre }}</span>
            <h3>{{ project.title }}</h3>

            <div class="meta-row">
              <div class="meta-item">
                <Clock :size="14" />
                <span>{{ project.lastEdited }}</span>
              </div>
              <div class="meta-item">
                <span class="dot"></span>
                <span>{{ project.wordCount }}</span>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>

  </section>
</template>

<style scoped>
.project-center {
  display: flex;
  flex: 1;
  width: 100%;
  min-height: 100%;
  overflow-y: auto;
  background: var(--arc-bg-body);
}

.project-shell {
  z-index: 1;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding:
    calc(var(--arc-titlebar-height) + clamp(12px, 2vw, 20px))
    max(clamp(20px, 3vw, 40px), calc(var(--arc-window-controls-width) + 24px))
    64px
    clamp(20px, 3vw, 40px);
}

.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 18px;
  margin-bottom: 40px;
}

.hero h1 {
  margin: 0 0 10px;
  color: #1d1d1f;
  font-size: clamp(32px, 4vw, 44px);
  font-weight: 650;
  letter-spacing: -0.04em;
}

.hero p {
  margin: 0;
  color: #86868b;
  font-size: clamp(15px, 2vw, 18px);
}

.create-button {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  border: none;
  border-radius: 999px;
  background: var(--arc-primary);
  color: white;
  cursor: pointer;
  font-size: 15px;
  font-weight: 650;
  padding: 16px 24px;
  box-shadow: 0 10px 26px color-mix(in srgb, var(--arc-primary) 30%, transparent);
  transition: all 0.28s ease;
}

.create-button:hover {
  background: var(--arc-primary-hover);
  transform: translateY(-2px);
  box-shadow: 0 18px 34px color-mix(in srgb, var(--arc-primary) 36%, transparent);
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
  gap: 28px;
}

.project-card {
  position: relative;
  display: flex;
  min-height: 292px;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(243, 244, 246, 0.9);
  border-radius: 28px;
  background: white;
  cursor: pointer;
  padding: 24px;
  animation: cardRise 0.45s ease both;
  transition:
    transform 0.32s ease,
    box-shadow 0.32s ease,
    border-color 0.32s ease;
}

.project-card:hover {
  transform: translateY(-6px);
  border-color: rgba(229, 231, 235, 0.95);
  box-shadow: 0 24px 40px rgba(0, 0, 0, 0.07);
}

.project-glow {
  position: absolute;
  top: -44px;
  right: -44px;
  width: 164px;
  height: 164px;
  border-radius: 999px;
  filter: blur(48px);
  opacity: 0.12;
}

.project-card-top,
.project-card-bottom {
  position: relative;
  z-index: 1;
}

.project-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: auto;
}

.project-icon {
  display: inline-flex;
  width: 58px;
  height: 58px;
  align-items: center;
  justify-content: center;
  border-radius: 20px;
  color: white;
  box-shadow: 0 10px 18px rgba(0, 0, 0, 0.14);
}

.more-button {
  display: inline-flex;
  width: 42px;
  height: 42px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  transition: all 0.2s ease;
}

.more-button:hover {
  background: rgba(0, 0, 0, 0.04);
  color: #1f2937;
}

:deep(.project-menu-danger-label) {
  color: #dc2626;
}

.project-genre {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: rgba(243, 244, 246, 0.9);
  color: #6b7280;
  font-size: 12px;
  font-weight: 600;
  padding: 8px 12px;
  margin-bottom: 14px;
}

.project-card h3 {
  margin: 0 0 18px;
  color: #1d1d1f;
  font-size: clamp(24px, 2.4vw, 30px);
  font-weight: 650;
  letter-spacing: -0.03em;
  transition: color 0.24s ease;
}

.project-card:hover h3 {
  color: var(--arc-primary);
}

.meta-row {
  display: flex;
  gap: 22px;
  color: #86868b;
  font-size: 13px;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #cfd4dc;
}

@keyframes cardRise {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 900px) {
  .hero {
    align-items: flex-start;
  }

  .create-button {
    width: 100%;
    justify-content: center;
  }

  .meta-row {
    flex-wrap: wrap;
    gap: 10px 18px;
  }
}
</style>
