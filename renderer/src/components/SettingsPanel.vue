<script setup lang="ts">
import { Cpu, FolderOutput, FileText, Palette, Save } from 'lucide-vue-next'
import { NButton, NCard, NFormItem, NInput, NSelect } from 'naive-ui'
import { themePresets } from '@/theme/presets'
import { useAppStore } from '@/stores/app'
import type { ThemeName } from '@/types/app'

const appStore = useAppStore()

const themeOptions = themePresets.map((preset) => ({
  label: preset.label,
  value: preset.name
}))
</script>

<template>
  <section class="settings-panel">
    <div class="section-head">
      <div>
        <h2>项目设置</h2>
        <p>管理模型连接、主题色和本地备份策略。</p>
      </div>
    </div>

    <div class="settings-wrap">
      <n-card class="setting-card" :bordered="false">
        <template #header>
          <div class="block-title">
            <Cpu :size="18" />
            <span>AI 模型配置</span>
          </div>
        </template>
        <n-form-item label="模型供应商">
          <n-select
            :options="[
              { label: 'OpenAI (GPT-4o)', value: 'openai' },
              { label: 'Anthropic (Claude 3.5)', value: 'anthropic' },
              { label: 'DeepSeek (DeepSeek-Chat)', value: 'deepseek' },
              { label: '本地模型 (Ollama)', value: 'ollama' }
            ]"
            :value="appStore.appSettings.provider"
            @update:value="(value) => appStore.updateAppSetting('provider', value ?? 'deepseek')"
          />
        </n-form-item>
        <n-form-item label="API Key">
          <n-input
            type="password"
            :value="appStore.appSettings.apiKey"
            @update:value="(value) => appStore.updateAppSetting('apiKey', value)"
          />
        </n-form-item>
        <n-form-item label="Base URL (自定义代理)">
          <n-input
            :value="appStore.appSettings.baseUrl"
            @update:value="(value) => appStore.updateAppSetting('baseUrl', value)"
          />
        </n-form-item>
      </n-card>

      <n-card class="setting-card" :bordered="false">
        <template #header>
          <div class="block-title">
            <Save :size="18" />
            <span>存储与备份</span>
          </div>
        </template>
        <div class="setting-row">
          <div>
            <div class="setting-name">自动保存时间间隔</div>
            <div class="setting-hint">当前已开启自动保存和版本快照</div>
          </div>
          <n-select
            class="compact-select"
            :options="[
              { label: '实时保存', value: 'live' },
              { label: '每 5 分钟', value: '5m' },
              { label: '每 10 分钟', value: '10m' }
            ]"
            :value="appStore.appSettings.autoSaveInterval"
            @update:value="(value) => appStore.updateAppSetting('autoSaveInterval', value ?? '5m')"
          />
        </div>
        <div class="setting-actions">
          <n-button round strong>
            <template #icon>
              <FolderOutput :size="16" />
            </template>
            导出项目为 JSON
          </n-button>
          <n-button round strong>
            <template #icon>
              <FileText :size="16" />
            </template>
            导出为 TXT
          </n-button>
        </div>
      </n-card>

      <n-card class="setting-card" :bordered="false">
        <template #header>
          <div class="block-title">
            <Palette :size="18" />
            <span>主题色</span>
          </div>
        </template>
        <n-form-item label="应用主题色">
          <n-select
            :options="themeOptions"
            :value="appStore.theme"
            @update:value="(value) => appStore.setTheme((value ?? 'ocean') as ThemeName)"
          />
        </n-form-item>
        <div class="theme-swatches">
          <button
            v-for="preset in themePresets"
            :key="preset.name"
            class="theme-dot"
            :class="{ active: appStore.theme === preset.name }"
            :style="{ background: preset.primary }"
            @click="appStore.setTheme(preset.name)"
          >
            <span>{{ preset.label }}</span>
          </button>
        </div>
      </n-card>
    </div>
  </section>
</template>

<style scoped>
.settings-panel {
  max-width: 960px;
  margin: 0 auto;
}

.section-head {
  margin-bottom: 32px;
}

.section-head h2 {
  margin: 0 0 8px;
  font-size: clamp(30px, 3.4vw, 38px);
  font-weight: 650;
  letter-spacing: -0.04em;
}

.section-head p {
  margin: 0;
  color: #86868b;
  font-size: 15px;
}

.settings-wrap {
  display: flex;
  width: min(100%, 640px);
  margin: 0 auto;
  flex-direction: column;
  gap: 24px;
}

.setting-card {
  border-radius: var(--arc-radius-lg);
  background: var(--arc-bg-surface);
  box-shadow: var(--arc-shadow-sm);
}

.block-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.setting-name {
  font-size: 14px;
  font-weight: 500;
}

.setting-hint {
  margin-top: 4px;
  color: var(--arc-text-secondary);
  font-size: 12px;
}

.compact-select {
  width: 136px;
}

.setting-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.theme-swatches {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}

.theme-dot {
  display: flex;
  width: 64px;
  height: 64px;
  align-items: end;
  justify-content: center;
  border: 3px solid transparent;
  border-radius: 18px;
  color: white;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  padding-bottom: 8px;
}

.theme-dot.active {
  border-color: #1d1d1f;
}

@media (max-width: 760px) {
  .setting-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .compact-select {
    width: 100%;
  }

  .setting-actions {
    flex-direction: column;
  }

  .setting-actions :deep(.n-button) {
    width: 100%;
    justify-content: center;
  }
}
</style>
