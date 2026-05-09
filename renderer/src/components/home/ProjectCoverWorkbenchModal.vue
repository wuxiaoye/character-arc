<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { BookOpen, ImagePlus, LoaderCircle, Sparkles, Upload, X } from 'lucide-vue-next'
import { NAlert, NButton, NCard, NForm, NFormItem, NInput, NModal, NTag, useMessage } from 'naive-ui'
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
  show: boolean
  project: ProjectSummary | null
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
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
    return '暂无拆书资产，本次会按通用商业网文封面逻辑生成。'
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
  () => [props.project?.id, props.show] as const,
  ([projectId, show], previousValue) => {
    if (!show) {
      return
    }

    const [previousProjectId, previousShow] = previousValue ?? []
    if (projectId !== previousProjectId || show !== previousShow) {
      resetWorkbench()
    }
  },
  { immediate: true }
)

function closeModal(): void {
  emit('update:show', false)
}

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
  <n-modal
    :show="show"
    preset="card"
    class="arc-editor-modal cover-workbench-modal"
    title="封面工作台"
    :bordered="false"
    @close="closeModal"
  >
    <div class="cover-workbench-layout">
      <section class="cover-workbench-sidebar">
        <n-card :bordered="false" class="cover-preview-card">
          <div class="cover-preview-stage">
            <div class="cover-preview" :style="coverPreviewStyle">
              <BookOpen :size="34" />
            </div>
            <div class="cover-preview-copy">
              <strong>{{ props.project?.title || '未命名作品' }}</strong>
              <p>{{ props.project?.genre || '待补充题材' }}</p>
              <span>{{ props.project?.targetPlatform || '通用网文平台' }}</span>
            </div>
          </div>

          <div class="cover-preview-actions">
            <n-button round strong @click="pickLocalCover">
              <template #icon>
                <Upload :size="16" />
              </template>
              本地上传
            </n-button>
            <n-button type="primary" round strong :disabled="isGeneratingImage" @click="generateCoverImage">
              <template #icon>
                <LoaderCircle v-if="isGeneratingImage" :size="16" class="spin-icon" />
                <Sparkles v-else :size="16" />
              </template>
              {{ isGeneratingImage ? '生成中...' : 'AI 生成封面' }}
            </n-button>
            <n-button round strong secondary :disabled="!props.project?.cover" @click="clearCover">
              <template #icon>
                <X :size="16" />
              </template>
              清除封面
            </n-button>
          </div>

          <n-alert :type="resolvedImageConfig.model ? 'info' : 'warning'" :show-icon="false" class="cover-config-alert">
            {{ imageConfigSummary }}
          </n-alert>

          <p class="cover-config-note">
            图片生成默认读取主页设置中的图片 API 配置；如果留空，会自动回退到文本模型配置。
          </p>

          <n-alert v-if="revisedPrompt" type="success" :show-icon="false" class="cover-config-alert">
            模型重写提示词：{{ revisedPrompt }}
          </n-alert>
        </n-card>
      </section>

      <section class="cover-workbench-main">
        <n-card :bordered="false" class="cover-workbench-card">
          <div class="cover-workbench-head">
            <div>
              <strong>封面提示词工作台</strong>
              <p>先把项目题材、平台和拆书资产翻译成可直接给画图模型或设计师使用的封面提示词。</p>
            </div>
            <n-tag round :bordered="false" type="info">
              {{ referenceTitles.length ? `已接入 ${referenceTitles.length} 个参考资产` : '通用模式' }}
            </n-tag>
          </div>

          <n-form label-placement="top">
            <div class="form-grid">
              <n-form-item label="作者署名">
                <n-input v-model:value="workbench.authorName" placeholder="例如：青岚 / 不填则使用“作者名待定”" />
              </n-form-item>
              <n-form-item label="补充画风 / 禁忌元素">
                <n-input
                  v-model:value="workbench.extraNotes"
                  type="textarea"
                  :autosize="{ minRows: 3, maxRows: 6 }"
                  placeholder="例如：偏电影海报感、避免 Q 版、不要过曝、强调主角神情"
                />
              </n-form-item>
            </div>
          </n-form>

          <n-alert type="info" :show-icon="false" class="cover-workbench-alert">
            {{ workbenchReferenceLabel }}
          </n-alert>

          <p class="cover-workbench-note">
            这里生成的是封面提示词资产；你可以先保存到知识库，也可以直接拿来驱动 AI 生成封面。
          </p>

          <div class="cover-workbench-actions">
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

          <div v-if="generatedPrompt" class="cover-workbench-result">
            <div class="cover-workbench-result-head">
              <div>
                <strong>{{ generatedPrompt.title }}</strong>
                <p>{{ generatedPrompt.summary }}</p>
              </div>
              <n-tag round :bordered="false" :type="isPromptStale ? 'warning' : 'success'">
                {{ isPromptStale ? '输入已变化' : '可直接生成' }}
              </n-tag>
            </div>

            <n-input
              :value="generatedPrompt.prompt"
              type="textarea"
              readonly
              :autosize="{ minRows: 10, maxRows: 20 }"
            />

            <div class="cover-workbench-keywords">
              <span v-for="keyword in generatedPrompt.keywords" :key="keyword">{{ keyword }}</span>
            </div>
          </div>
        </n-card>
      </section>
    </div>

    <template #footer>
      <div class="arc-modal-actions">
        <n-button round strong @click="closeModal">完成</n-button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.cover-workbench-modal :deep(.n-card) {
  width: min(1120px, 94vw);
  border-radius: 14px;
}

.cover-workbench-layout {
  display: grid;
  grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
  gap: 18px;
}

.cover-workbench-sidebar,
.cover-workbench-main {
  min-width: 0;
}

.cover-preview-card,
.cover-workbench-card {
  border-radius: 18px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--arc-bg-surface) 92%, white) 0%, var(--arc-bg-surface) 100%);
}

.cover-preview-stage {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cover-preview {
  display: flex;
  width: 100%;
  aspect-ratio: 2 / 3;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 20px;
  color: rgba(255, 255, 255, 0.92);
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.18);
}

.cover-preview-copy strong {
  display: block;
  color: var(--arc-text-primary);
  font-size: 18px;
}

.cover-preview-copy p,
.cover-preview-copy span,
.cover-config-note,
.cover-workbench-head p,
.cover-workbench-result-head p,
.cover-workbench-note {
  margin: 6px 0 0;
  color: var(--arc-text-secondary);
  line-height: 1.7;
}

.cover-preview-copy span {
  display: inline-block;
  font-size: 12px;
}

.cover-preview-actions {
  display: grid;
  gap: 10px;
  margin-top: 18px;
}

.cover-config-alert {
  margin-top: 14px;
  border-radius: 14px;
}

.cover-config-note,
.cover-workbench-note {
  font-size: 13px;
}

.cover-workbench-head,
.cover-workbench-result-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.cover-workbench-head strong,
.cover-workbench-result-head strong {
  color: var(--arc-text-primary);
  font-size: 16px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.cover-workbench-alert {
  margin-top: 4px;
  border-radius: 14px;
}

.cover-workbench-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 14px;
}

.cover-workbench-result {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 18px;
}

.cover-workbench-keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cover-workbench-keywords span {
  border-radius: 999px;
  background: color-mix(in srgb, var(--arc-primary) 10%, transparent);
  color: var(--arc-primary);
  padding: 4px 10px;
  font-size: 12px;
}

.spin-icon {
  animation: arc-spin 1s linear infinite;
}

@keyframes arc-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 900px) {
  .cover-workbench-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .cover-workbench-head,
  .cover-workbench-result-head {
    flex-direction: column;
  }
}
</style>
