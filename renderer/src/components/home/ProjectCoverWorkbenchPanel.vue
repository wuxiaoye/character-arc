<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { BookOpen, ImagePlus, LoaderCircle, Sparkles, Upload, X } from 'lucide-vue-next'
import { NAlert, NButton, NForm, NFormItem, NInput, NTag, useMessage } from 'naive-ui'
import {
  buildCoverPromptWorkbenchResult,
  type CoverPromptWorkbenchInput,
  type CoverPromptWorkbenchResult
} from '@/features/cover/promptWorkbench'
import { resolveCoverStyle } from '@/features/cover/display'
import { useAppStore } from '@/stores/app'
import { toIpcPayload } from '@/utils/ipcPayload'
import type { ProjectSummary } from '@/types/app'

const props = defineProps<{
  project: ProjectSummary | null
}>()

const emit = defineEmits<{
  (e: 'update-cover', payload: { projectId: string; cover: string }): void
  (e: 'save-cover-prompt', payload: CoverPromptWorkbenchInput): void
}>()

const appStore = useAppStore()
const message = useMessage()

const workbench = reactive({
  authorName: '',
  extraNotes: ''
})

const generatedPrompt = ref<CoverPromptWorkbenchResult | null>(null)
const generatedPromptFingerprint = ref('')
const isGeneratingImage = ref(false)
const revisedPrompt = ref('')

const referenceTitles = computed(() => props.project?.referenceWorks.map((work) => work.title).filter(Boolean) ?? [])
const workbenchReferenceLabel = computed(() => {
  if (!referenceTitles.value.length) {
    return '暂无拆书资产，本次将按通用商业网文封面逻辑生成。'
  }

  const previews = referenceTitles.value.slice(0, 3).join('、')
  const suffix = referenceTitles.value.length > 3 ? ` 等 ${referenceTitles.value.length} 部作品` : ''
  return `本次会参考：${previews}${suffix}`
})

const coverPreviewStyle = computed(() => resolveCoverStyle(props.project?.cover))
const resolvedImageConfig = computed(() => ({
  model: appStore.appSettings.imageModel.trim() || appStore.appSettings.model.trim(),
  baseUrl: appStore.appSettings.imageBaseUrl.trim() || appStore.appSettings.baseUrl.trim(),
  apiKey: appStore.appSettings.imageApiKey.trim() || appStore.appSettings.apiKey.trim()
}))
const imageConfigSummary = computed(() => {
  const config = resolvedImageConfig.value
  if (!config.model || !config.baseUrl) {
    return '尚未配置图片生成接口，请先到主页设置中补充。'
  }

  return `当前将使用 ${config.model} · ${config.baseUrl}`
})

const isPromptStale = computed(() => {
  const input = createWorkbenchInput()
  if (!input || !generatedPrompt.value) {
    return false
  }

  return buildWorkbenchFingerprint(input) !== generatedPromptFingerprint.value
})

function resetWorkbench(): void {
  workbench.authorName = ''
  workbench.extraNotes = ''
  generatedPrompt.value = null
  generatedPromptFingerprint.value = ''
  revisedPrompt.value = ''
  isGeneratingImage.value = false
}

watch(
  () => props.project?.id,
  () => {
    resetWorkbench()
  },
  { immediate: true }
)

function createWorkbenchInput(): CoverPromptWorkbenchInput | null {
  if (!props.project) {
    return null
  }

  return {
    project: props.project,
    authorName: workbench.authorName,
    extraNotes: workbench.extraNotes
  }
}

function buildWorkbenchFingerprint(input: CoverPromptWorkbenchInput): string {
  return JSON.stringify({
    projectTitle: input.project.title,
    genre: input.project.genre,
    targetPlatform: input.project.targetPlatform,
    novelLength: input.project.novelLength,
    referenceTitles: input.project.referenceWorks.map((work) => work.title),
    authorName: input.authorName.trim(),
    extraNotes: input.extraNotes.trim()
  })
}

function ensureProjectReady(): CoverPromptWorkbenchInput | null {
  const input = createWorkbenchInput()
  if (!input) {
    return null
  }

  if (!input.project.title.trim() || !input.project.genre.trim()) {
    message.warning('请先在编辑项目信息里填写标题和题材分类，再生成封面。')
    return null
  }

  return input
}

function generateCoverPrompt(): CoverPromptWorkbenchResult | null {
  const input = ensureProjectReady()
  if (!input) {
    return null
  }

  generatedPrompt.value = buildCoverPromptWorkbenchResult(input)
  generatedPromptFingerprint.value = buildWorkbenchFingerprint(input)
  return generatedPrompt.value
}

function saveCoverPrompt(): void {
  const input = createWorkbenchInput()
  if (!input || !generatedPrompt.value) {
    message.warning('请先生成封面提示词，再保存到知识库。')
    return
  }

  if (isPromptStale.value) {
    message.warning('封面提示词依赖的输入已变化，请重新生成后再保存。')
    return
  }

  emit('save-cover-prompt', input)
}

async function pickLocalCover(): Promise<void> {
  if (!props.project?.id) {
    return
  }

  const result = await window.characterArc.pickCoverImage()
  if (!result.success || result.canceled || !result.dataUrl) {
    return
  }

  revisedPrompt.value = ''
  emit('update-cover', {
    projectId: props.project.id,
    cover: result.dataUrl
  })
  message.success('封面已替换为本地图片。')
}

function clearCover(): void {
  if (!props.project?.id) {
    return
  }

  revisedPrompt.value = ''
  emit('update-cover', {
    projectId: props.project.id,
    cover: ''
  })
}

async function generateCoverImage(): Promise<void> {
  if (!props.project?.id || isGeneratingImage.value) {
    return
  }

  const promptResult = (!generatedPrompt.value || isPromptStale.value)
    ? generateCoverPrompt()
    : generatedPrompt.value
  if (!promptResult) {
    return
  }

  isGeneratingImage.value = true
  try {
    const result = await window.characterArc.generateImage({
      settings: toIpcPayload({ ...appStore.appSettings }),
      prompt: promptResult.prompt
    })
    if (!result.success || !result.result?.dataUrl) {
      throw new Error(result.error ?? '图片生成失败')
    }

    revisedPrompt.value = result.result.revisedPrompt?.trim() || ''
    emit('update-cover', {
      projectId: props.project.id,
      cover: result.result.dataUrl
    })
    message.success('AI 封面已生成。')
  } catch (error) {
    message.error(error instanceof Error ? error.message : '图片生成失败')
  } finally {
    isGeneratingImage.value = false
  }
}
</script>

<template>
  <div class="cover-workbench-panel">
    <div class="cover-workbench-body">
      <section class="prompt-section">
        <div class="section-head">
          <div>
            <strong>封面提示词工作台</strong>
            <p>把项目题材、平台和拆书资产翻译成可直接给画图模型或设计师使用的封面提示词。</p>
          </div>
        </div>

        <n-alert type="info" :show-icon="false" class="reference-alert">
          {{ workbenchReferenceLabel }}
        </n-alert>

        <div class="editor-block">
          <n-form label-placement="top">
            <div class="form-grid">
              <n-form-item label="作者署名">
                <n-input v-model:value="workbench.authorName" placeholder="例如：青岚 / 不填则使用“作者名待定”" />
              </n-form-item>
              <n-form-item label="补充画风 / 禁忌元素">
                <n-input
                  v-model:value="workbench.extraNotes"
                  type="textarea"
                  :autosize="{ minRows: 5, maxRows: 8 }"
                  placeholder="例如：偏电影海报感、避免 Q 版、不要过曝、强调主角神情"
                />
              </n-form-item>
            </div>
          </n-form>

          <div class="toolbar">
            <n-button type="primary" round strong @click="generateCoverPrompt">
              <template #icon>
                <ImagePlus :size="16" />
              </template>
              生成提示词
            </n-button>
            <n-button round strong secondary :disabled="!generatedPrompt || isPromptStale" @click="saveCoverPrompt">
              保存到知识库
            </n-button>
          </div>
        </div>

        <div class="result-block">
          <div class="result-head">
            <div>
              <strong>{{ generatedPrompt?.title || '提示词预览区' }}</strong>
              <p>{{ generatedPrompt?.summary || '生成后会在这里展示完整提示词、状态和关键词。' }}</p>
            </div>
            <n-tag v-if="generatedPrompt" round :bordered="false" :type="isPromptStale ? 'warning' : 'success'">
              {{ isPromptStale ? '输入已变化' : '可直接生成' }}
            </n-tag>
          </div>

          <template v-if="generatedPrompt">
            <n-input
              :value="generatedPrompt.prompt"
              type="textarea"
              readonly
              :autosize="{ minRows: 14, maxRows: 20 }"
            />

            <div class="keyword-list">
              <span v-for="keyword in generatedPrompt.keywords" :key="keyword">{{ keyword }}</span>
            </div>
          </template>

          <div v-else class="empty-state">
            <div class="empty-badge">
              <Sparkles :size="20" />
            </div>
            <strong>先生成一版封面提示词</strong>
            <p>建议先补充画风方向，再点击上方的“生成提示词”，这样后续 AI 出图会更稳。</p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.cover-workbench-panel {
  width: 100%;
  min-width: 0;
}

.cover-workbench-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.cover-section,
.prompt-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  border: 1px solid var(--arc-border);
  border-radius: 16px;
  background: var(--arc-bg-surface);
  padding: 20px;
}

.section-head,
.result-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.section-head strong,
.result-head strong,
.panel-block strong,
.empty-state strong {
  display: block;
  color: var(--arc-text-primary);
  font-size: 18px;
  font-weight: 700;
}

.section-head p,
.result-head p,
.panel-block p,
.note-block,
.empty-state p {
  margin: 6px 0 0;
  color: var(--arc-text-secondary);
  line-height: 1.7;
}

.cover-stage-row {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.cover-preview {
  display: flex;
  width: 100%;
  aspect-ratio: 2 / 3;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 16px;
  color: rgba(255, 255, 255, 0.92);
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.16);
}

.cover-side-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.panel-block,
.editor-block,
.result-block {
  display: flex;
  flex-direction: column;
  gap: 14px;
  border: 1px solid var(--arc-border);
  border-radius: 14px;
  background: var(--arc-bg-weak);
  padding: 16px;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.action-grid > :last-child {
  grid-column: 1 / -1;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.reference-alert {
  border-radius: 12px;
}

.keyword-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.keyword-list span {
  border-radius: 999px;
  background: color-mix(in srgb, var(--arc-primary) 10%, transparent);
  color: var(--arc-primary);
  padding: 4px 10px;
  font-size: 12px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  min-height: 220px;
}

.empty-badge {
  display: inline-flex;
  width: 52px;
  height: 52px;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: color-mix(in srgb, var(--arc-primary) 10%, var(--arc-bg-mix));
  color: var(--arc-primary);
}

.spin-icon {
  animation: arc-spin 1s linear infinite;
}

@keyframes arc-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 960px) {
  .cover-stage-row,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .cover-preview {
    width: min(260px, 100%);
    margin: 0 auto;
  }
}

@media (max-width: 720px) {
  .cover-section,
  .prompt-section,
  .panel-block,
  .editor-block,
  .result-block {
    padding: 14px;
    border-radius: 12px;
  }

  .section-head,
  .result-head {
    flex-direction: column;
  }

  .action-grid {
    grid-template-columns: 1fr;
  }

  .action-grid > :last-child {
    grid-column: auto;
  }
}
</style>
