<script setup lang="ts">
import { computed } from 'vue'
import { NConfigProvider, NGlobalStyle, NMessageProvider } from 'naive-ui'
import { useAppStore } from '@/stores/app'
import { createNaiveThemeOverrides } from '@/theme/presets'
import ProjectCenter from '@/pages/ProjectCenter.vue'
import ProjectWizardPage from '@/pages/ProjectWizardPage.vue'
import WorkbenchPage from '@/pages/WorkbenchPage.vue'

const appStore = useAppStore()
const platform = window.characterArc?.platform ?? 'unknown'

const themeOverrides = computed(() => createNaiveThemeOverrides(appStore.theme))
const appStyleVars = computed(() => ({
  '--arc-bg-body': '#f5f5f7',
  '--arc-bg-surface': '#ffffff',
  '--arc-bg-surface-hover': '#f2f2f7',
  '--arc-text-primary': '#1d1d1f',
  '--arc-text-secondary': '#86868b',
  '--arc-primary': appStore.currentTheme.primary,
  '--arc-primary-hover': appStore.currentTheme.primaryHover,
  '--arc-primary-pressed': appStore.currentTheme.primaryPressed,
  '--arc-primary-soft': appStore.currentTheme.softBackground,
  '--arc-border': 'rgba(0, 0, 0, 0.06)',
  '--arc-shadow-sm': '0 2px 10px rgba(0, 0, 0, 0.03)',
  '--arc-shadow-md': '0 10px 30px rgba(0, 0, 0, 0.06)',
  '--arc-radius-sm': '8px',
  '--arc-radius-md': '12px',
  '--arc-radius-lg': '20px',
  '--arc-titlebar-height': platform === 'win32' ? '28px' : platform === 'darwin' ? '24px' : '0px',
  '--arc-window-controls-width': platform === 'win32' ? '138px' : '0px'
}))
</script>

<template>
  <n-config-provider :theme-overrides="themeOverrides">
    <n-message-provider>
      <n-global-style />
      <div class="app-shell" :style="appStyleVars">
        <Transition name="view-fade" mode="out-in">
          <ProjectCenter v-if="appStore.currentView === 'projects'" key="projects" />
          <ProjectWizardPage v-else-if="appStore.currentView === 'wizard'" key="wizard" />
          <WorkbenchPage v-else key="workbench" />
        </Transition>
      </div>
    </n-message-provider>
  </n-config-provider>
</template>
