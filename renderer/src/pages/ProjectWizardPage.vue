<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ArrowLeft, BookA, CheckCircle2, ChevronRight, Info, Sparkles } from 'lucide-vue-next'
import { NCheckbox, useMessage } from 'naive-ui'
import { useAppStore } from '@/stores/app'
import { toIpcPayload } from '@/utils/ipcPayload'
import { createProjectWorkspaceSeed, type ProjectBootstrapResult } from '@/features/wizard/projectSeed'
import {
  DEFAULT_PROJECT_GENRE,
  DEFAULT_PROJECT_GENRE_KEY,
  NOVEL_LENGTH_OPTIONS,
  PROJECT_GENRE_GROUP_LABELS,
  PROJECT_GENRE_GROUPS,
  PROJECT_GENRE_OPTIONS,
  resolveNovelLengthLabel
} from '@/features/wizard/projectGenres'
import type { NovelLength } from '@/types/app'

const appStore = useAppStore()
const message = useMessage()

const step = ref(1)
const isGenerating = ref(false)

const formData = reactive({
  title: '',
  selectedGenreKey: DEFAULT_PROJECT_GENRE_KEY,
  customGenre: '',
  novelLength: 'long' as NovelLength,
  premise: '',
  shouldGenerate: true
})

const steps = [
  { num: 1, title: '基础设定', desc: '确定题材与作品长度' },
  { num: 2, title: '小说简介', desc: '用一句话立住故事钩子' },
  { num: 3, title: '创建方式', desc: '决定是否让 AI 先搭好骨架' }
] as const

const genreGroups = PROJECT_GENRE_GROUPS.map((groupId) => ({
  id: groupId,
  label: PROJECT_GENRE_GROUP_LABELS[groupId],
  options: PROJECT_GENRE_OPTIONS.filter((option) => option.group === groupId)
}))

const selectedGenreOption = computed(() =>
  PROJECT_GENRE_OPTIONS.find((option) => option.key === formData.selectedGenreKey)
)
const isCustomGenre = computed(() => selectedGenreOption.value?.isCustom === true)
const resolvedGenre = computed(() =>
  isCustomGenre.value ? formData.customGenre.trim() : selectedGenreOption.value?.label ?? DEFAULT_PROJECT_GENRE
)
const selectedGenreLabel = computed(() =>
  isCustomGenre.value ? resolvedGenre.value || '自定义题材' : selectedGenreOption.value?.label ?? DEFAULT_PROJECT_GENRE
)
const novelLengthLabel = computed(() => resolveNovelLengthLabel(formData.novelLength))

const canContinue = computed(() => {
  if (step.value === 1) {
    return formData.title.trim().length > 0 && resolvedGenre.value.length > 0
  }
  if (step.value === 2) {
    return formData.premise.trim().length > 0
  }
  return !isGenerating.value
})

function resetWizard(): void {
  step.value = 1
  isGenerating.value = false
  formData.title = ''
  formData.selectedGenreKey = DEFAULT_PROJECT_GENRE_KEY
  formData.customGenre = ''
  formData.novelLength = 'long'
  formData.premise = ''
  formData.shouldGenerate = true
}

function goBack(): void {
  if (step.value > 1 && !isGenerating.value) {
    step.value -= 1
    return
  }

  if (!isGenerating.value) {
    appStore.closeWizard()
  }
}

function selectGenre(genreKey: string): void {
  formData.selectedGenreKey = genreKey
}

async function goNext(): Promise<void> {
  if (!canContinue.value || isGenerating.value) {
    return
  }

  if (step.value < 3) {
    step.value += 1
    return
  }

  isGenerating.value = true
  try {
    let bootstrapResult: ProjectBootstrapResult | null = null

    if (formData.shouldGenerate) {
      const result = await window.characterArc.generateAi(
        toIpcPayload({
          task: 'project-bootstrap',
          settings: appStore.appSettings,
          context: {
            projectTitle: formData.title,
            projectGenre: resolvedGenre.value,
            projectNovelLength: formData.novelLength,
            projectPremise: formData.premise
          }
        })
      )

      if (!result.success || !result.result) {
        throw new Error(result.error ?? 'AI 初始化项目失败')
      }

      bootstrapResult = result.result as ProjectBootstrapResult
    }

    appStore.createProjectWorkspace(
      createProjectWorkspaceSeed(
        {
          title: formData.title,
          genre: resolvedGenre.value,
          novelLength: formData.novelLength,
          premise: formData.premise,
          shouldGenerate: formData.shouldGenerate
        },
        bootstrapResult
      )
    )
    resetWizard()
  } catch (error) {
    message.error(error instanceof Error ? error.message : '创建项目失败，请稍后重试')
  } finally {
    isGenerating.value = false
  }
}
</script>

<template>
  <section class="wizard-page">
    <div class="bg-orb bg-orb-left"></div>
    <div class="bg-orb bg-orb-right"></div>

    <div class="wizard-card">
      <button class="back-button" @click="goBack">
        <ArrowLeft :size="24" />
      </button>

      <div class="wizard-head">
        <div class="stepper">
          <template v-for="(item, index) in steps" :key="item.num">
            <div class="step-badge" :class="{ active: step === item.num, done: step > item.num }">
              <CheckCircle2 v-if="step > item.num" :size="18" />
              <span v-else>{{ item.num }}</span>
            </div>
            <div
              v-if="index < steps.length - 1"
              class="step-line"
              :class="{ done: step > item.num }"
            ></div>
          </template>
        </div>

        <h2>{{ steps[step - 1].title }}</h2>
        <p>{{ steps[step - 1].desc }}</p>
      </div>

      <div class="wizard-body">
        <Transition name="wizard-step" mode="out-in">
          <div v-if="step === 1" key="step-1" class="step-pane">
            <div class="field">
              <label>作品名称</label>
              <div class="input-shell">
                <BookA :size="18" class="input-icon" />
                <input
                  v-model="formData.title"
                  type="text"
                  placeholder="例如：星渊拾遗"
                  class="wizard-input"
                />
              </div>
            </div>

            <div class="field">
              <label>作品题材</label>
              <div class="genre-stack">
                <section v-for="group in genreGroups" :key="group.id" class="genre-section">
                  <h4>{{ group.label }}</h4>
                  <div class="genre-grid">
                    <button
                      v-for="genre in group.options"
                      :key="genre.key"
                      type="button"
                      class="genre-chip"
                      :class="{ active: formData.selectedGenreKey === genre.key }"
                      @click="selectGenre(genre.key)"
                    >
                      {{ genre.label }}
                    </button>
                  </div>
                </section>

                <section class="genre-section custom-genre-section">
                  <h4>自定义题材</h4>
                  <button
                    type="button"
                    class="genre-chip custom-genre-chip"
                    :class="{ active: isCustomGenre }"
                    @click="selectGenre('custom')"
                  >
                    自定义题材
                  </button>
                  <div v-if="isCustomGenre" class="custom-genre-input-wrap">
                    <input
                      v-model="formData.customGenre"
                      type="text"
                      placeholder="例如：废土美食 / 赛博修仙 / 民俗怪谈"
                      class="wizard-input custom-genre-input"
                    />
                    <p class="field-hint">会直接按你填写的题材生成，题材名会被写入项目卡片。</p>
                  </div>
                </section>
              </div>
            </div>

            <div class="field">
              <label>作品长度</label>
              <div class="length-grid">
                <button
                  v-for="option in NOVEL_LENGTH_OPTIONS"
                  :key="option.value"
                  type="button"
                  class="length-card"
                  :class="{ active: formData.novelLength === option.value }"
                  @click="formData.novelLength = option.value"
                >
                  <strong>{{ option.label }}</strong>
                  <span>{{ option.description }}</span>
                </button>
              </div>
            </div>
          </div>

          <div v-else-if="step === 2" key="step-2" class="step-pane">
            <div class="field grow">
              <label class="inline-label">
                <span>小说简介</span>
                <Info :size="14" />
              </label>
              <textarea
                v-model="formData.premise"
                class="wizard-textarea"
                placeholder="描述这个故事的主角、核心冲突、目标或最吸引人的设定。例如：一个能看见未来死亡片段的实习法医，被迫和自己即将解剖的尸体合作，追查一场还没发生的连环谋杀。"
              ></textarea>
              <p class="field-hint">AI 会优先根据题材、长短篇和这段简介来生成开局世界观与前三章大纲。</p>
            </div>
          </div>

          <div v-else key="step-3" class="step-pane step-generate">
            <div class="generate-icon-wrap">
              <div class="generate-glow"></div>
              <div class="generate-icon">
                <Sparkles :size="38" :class="{ pulse: isGenerating }" />
                <div v-if="isGenerating" class="progress-ring"></div>
              </div>
            </div>

            <h3>{{ isGenerating ? '正在创建项目工作区...' : '准备就绪' }}</h3>
            <p>
              {{
                isGenerating
                  ? formData.shouldGenerate
                    ? '正在根据题材、作品长度和小说简介生成首批世界观与剧情大纲，并同步创建章节草稿。'
                    : '正在创建项目脚手架，并为你准备首卷与第一章草稿。'
                  : `项目名为“${formData.title || '未命名作品'}”，题材为 ${selectedGenreLabel}，长度为 ${novelLengthLabel}。你可以直接创建，或让 AI 先帮你生成开局骨架。`
              }}
            </p>

            <div v-if="!isGenerating" class="package-card">
              <div class="package-head">
                <span>初始化方式</span>
                <span>{{ formData.shouldGenerate ? 'AI 生成初始内容' : '直接创建空白项目' }}</span>
              </div>

              <dl class="summary-grid">
                <div>
                  <dt>题材</dt>
                  <dd>{{ selectedGenreLabel }}</dd>
                </div>
                <div>
                  <dt>篇幅</dt>
                  <dd>{{ novelLengthLabel }}</dd>
                </div>
                <div class="summary-block">
                  <dt>简介</dt>
                  <dd>{{ formData.premise }}</dd>
                </div>
              </dl>

              <n-checkbox v-model:checked="formData.shouldGenerate" class="bootstrap-toggle">
                自动调用 AI 生成初始世界观与大纲
              </n-checkbox>
              <ul>
                <li><CheckCircle2 :size="16" /> 项目卡片会保存题材与长篇 / 短篇信息</li>
                <li><CheckCircle2 :size="16" /> 自动生成时，会按题材、篇幅和简介生成首批设定与剧情骨架</li>
                <li><CheckCircle2 :size="16" /> 系统会同步创建首卷和可直接进入写作的章节草稿</li>
                <li><CheckCircle2 :size="16" /> 关闭自动生成时，仅保留项目脚手架与首章草稿</li>
              </ul>
            </div>
          </div>
        </Transition>
      </div>

      <div class="wizard-footer">
        <button class="primary-action" :disabled="!canContinue" @click="goNext">
          <template v-if="step < 3">
            <span>下一步</span>
            <ChevronRight :size="18" />
          </template>
          <template v-else>
            <Sparkles v-if="!isGenerating" :size="18" />
            <span>{{ isGenerating ? '创建中...' : formData.shouldGenerate ? '开始 AI 构建' : '直接创建项目' }}</span>
          </template>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.wizard-page {
  position: relative;
  display: flex;
  min-height: 100%;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: clamp(24px, 4vw, 48px) 16px;
}

.bg-orb {
  position: absolute;
  width: 26rem;
  height: 26rem;
  border-radius: 999px;
  filter: blur(100px);
  opacity: 0.26;
  pointer-events: none;
}

.bg-orb-left {
  top: 40px;
  left: 80px;
  background: color-mix(in srgb, var(--arc-primary) 62%, white 38%);
}

.bg-orb-right {
  right: 80px;
  bottom: 40px;
  background: linear-gradient(135deg, rgba(109, 93, 252, 0.35), rgba(120, 163, 255, 0.3));
}

.wizard-card {
  position: relative;
  z-index: 1;
  display: flex;
  width: 100%;
  max-width: 880px;
  min-height: min(680px, calc(100dvh - 48px));
  max-height: calc(100dvh - 32px);
  flex-direction: column;
  overflow: auto;
  border: 1px solid rgba(255, 255, 255, 0.75);
  border-radius: 34px;
  background: rgba(255, 255, 255, 0.74);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.06);
  backdrop-filter: blur(28px);
  padding: 32px clamp(22px, 4vw, 40px) 36px;
}

.back-button {
  position: absolute;
  top: 28px;
  left: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--arc-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.back-button:hover {
  background: rgba(0, 0, 0, 0.04);
  color: var(--arc-text-primary);
}

.wizard-head {
  margin-top: 52px;
  margin-bottom: 32px;
  text-align: center;
}

.stepper {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 18px;
}

.step-badge {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #eceef3;
  color: #9aa0ab;
  font-size: 14px;
  font-weight: 700;
  transition: all 0.28s ease;
}

.step-badge.active {
  background: var(--arc-primary);
  color: white;
  box-shadow: 0 12px 28px color-mix(in srgb, var(--arc-primary) 32%, transparent);
}

.step-badge.done {
  background: #16a34a;
  color: white;
}

.step-line {
  width: 50px;
  height: 4px;
  margin: 0 10px;
  border-radius: 999px;
  background: #eceef3;
}

.step-line.done {
  background: #16a34a;
}

.wizard-head h2 {
  margin: 0 0 8px;
  font-size: clamp(28px, 3vw, 34px);
  font-weight: 650;
  letter-spacing: -0.03em;
}

.wizard-head p {
  margin: 0;
  color: var(--arc-text-secondary);
  font-size: 15px;
}

.wizard-body {
  display: flex;
  flex: 1;
}

.step-pane {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 26px;
}

.grow {
  flex: 1;
}

.field label {
  display: block;
  margin-bottom: 10px;
  margin-left: 4px;
  color: #4b5563;
  font-size: 14px;
  font-weight: 600;
}

.inline-label {
  display: inline-flex !important;
  align-items: center;
  gap: 6px;
}

.input-shell {
  position: relative;
}

.input-icon {
  position: absolute;
  top: 50%;
  left: 16px;
  transform: translateY(-50%);
  color: #9ca3af;
}

.wizard-input,
.wizard-textarea {
  width: 100%;
  border: 1px solid rgba(209, 213, 219, 0.6);
  border-radius: 22px;
  background: rgba(249, 250, 251, 0.76);
  color: var(--arc-text-primary);
  outline: none;
  transition: all 0.24s ease;
}

.wizard-input:focus,
.wizard-textarea:focus {
  border-color: color-mix(in srgb, var(--arc-primary) 72%, white);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--arc-primary) 14%, transparent);
}

.wizard-input {
  padding: 18px 18px 18px 48px;
  font-size: 18px;
}

.genre-stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.genre-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.genre-section h4 {
  margin: 0 0 2px;
  color: #6b7280;
  font-size: 13px;
  font-weight: 700;
}

.genre-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.genre-chip,
.length-card {
  border: 2px solid transparent;
  background: rgba(249, 250, 251, 0.78);
  transition: all 0.24s ease;
}

.genre-chip {
  border-radius: 18px;
  color: #6b7280;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  padding: 14px 12px;
}

.genre-chip:hover,
.length-card:hover {
  background: rgba(243, 244, 246, 0.96);
}

.genre-chip.active,
.length-card.active {
  border-color: color-mix(in srgb, var(--arc-primary) 18%, white);
  background: color-mix(in srgb, var(--arc-primary) 10%, white);
  color: var(--arc-primary);
}

.custom-genre-section {
  align-items: flex-start;
}

.custom-genre-chip {
  min-width: 160px;
}

.custom-genre-input-wrap {
  width: 100%;
}

.custom-genre-input {
  padding-left: 18px;
  font-size: 15px;
}

.length-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.length-card {
  display: flex;
  min-height: 96px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 8px;
  border-radius: 22px;
  color: #4b5563;
  cursor: pointer;
  padding: 18px;
  text-align: left;
}

.length-card strong {
  font-size: 16px;
}

.length-card span {
  color: inherit;
  font-size: 13px;
  line-height: 1.6;
}

.wizard-textarea {
  min-height: 240px;
  resize: none;
  padding: 18px 20px;
  font-size: 15px;
  line-height: 1.75;
}

.field-hint {
  margin: 12px 0 0 4px;
  color: #9ca3af;
  font-size: 12px;
}

.step-generate {
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 12px 0;
}

.generate-icon-wrap {
  position: relative;
  margin-bottom: 28px;
}

.generate-glow {
  position: absolute;
  inset: -18px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--arc-primary) 15%, white), rgba(124, 58, 237, 0.12));
  filter: blur(20px);
}

.generate-icon {
  position: relative;
  display: inline-flex;
  width: 96px;
  height: 96px;
  align-items: center;
  justify-content: center;
  border-radius: 28px;
  background: linear-gradient(135deg, rgba(229, 241, 255, 0.96), rgba(242, 233, 255, 0.92));
  color: var(--arc-primary);
}

.pulse {
  animation: pulseGlow 1.4s ease-in-out infinite;
}

.progress-ring {
  position: absolute;
  inset: -4px;
  border-radius: 30px;
  background: conic-gradient(var(--arc-primary), rgba(124, 58, 237, 0.9), var(--arc-primary));
  mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 0);
  animation: spinRing 2.5s linear infinite;
}

.step-generate h3 {
  margin: 0 0 14px;
  font-size: 28px;
  font-weight: 650;
}

.step-generate p {
  max-width: 520px;
  margin: 0 0 28px;
  color: #6b7280;
  font-size: 14px;
  line-height: 1.75;
}

.package-card {
  width: 100%;
  max-width: 560px;
  border: 1px solid rgba(229, 231, 235, 0.9);
  border-radius: 22px;
  background: rgba(249, 250, 251, 0.8);
  padding: 18px 20px;
  text-align: left;
}

.package-head {
  display: flex;
  justify-content: space-between;
  padding-bottom: 10px;
  margin-bottom: 14px;
  border-bottom: 1px solid rgba(229, 231, 235, 0.9);
  color: #6b7280;
  font-size: 14px;
}

.package-head span:last-child {
  color: #374151;
  font-weight: 600;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 14px;
  margin: 0 0 16px;
}

.summary-grid div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.summary-grid dt {
  color: #9ca3af;
  font-size: 12px;
}

.summary-grid dd {
  margin: 0;
  color: #374151;
  font-size: 14px;
  line-height: 1.6;
}

.summary-block {
  grid-column: 1 / -1;
}

.bootstrap-toggle {
  display: inline-flex;
  margin-bottom: 16px;
  color: #374151;
  font-size: 14px;
  font-weight: 600;
}

.package-card ul {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0;
  margin: 0;
  list-style: none;
  color: #6b7280;
  font-size: 14px;
}

.package-card li {
  display: flex;
  align-items: center;
  gap: 10px;
}

.package-card li :deep(svg) {
  color: #16a34a;
}

.wizard-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 24px;
  margin-top: 24px;
  border-top: 1px solid rgba(229, 231, 235, 0.75);
}

.primary-action {
  display: inline-flex;
  width: auto;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--arc-primary), color-mix(in srgb, var(--arc-primary) 50%, #7c3aed));
  color: white;
  cursor: pointer;
  font-size: 16px;
  font-weight: 650;
  padding: 16px 28px;
  box-shadow: 0 16px 34px color-mix(in srgb, var(--arc-primary) 28%, transparent);
  transition: transform 0.24s ease, box-shadow 0.24s ease, opacity 0.24s ease;
}

.primary-action:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 22px 44px color-mix(in srgb, var(--arc-primary) 34%, transparent);
}

.primary-action:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
}

@media (max-width: 900px) {
  .wizard-card {
    min-height: auto;
    padding-top: 26px;
  }

  .wizard-head {
    margin-top: 44px;
  }

  .genre-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .package-head {
    flex-direction: column;
    gap: 4px;
  }

  .wizard-footer {
    justify-content: stretch;
  }

  .primary-action {
    width: 100%;
  }
}

@media (max-height: 820px) {
  .wizard-page {
    align-items: stretch;
  }

  .wizard-card {
    min-height: auto;
  }
}

@media (max-width: 760px) {
  .genre-grid,
  .length-grid,
  .summary-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .wizard-page {
    align-items: stretch;
  }

  .wizard-card {
    border-radius: 26px;
  }

  .stepper {
    transform: scale(0.92);
  }

  .wizard-textarea {
    min-height: 200px;
  }
}

.wizard-step-enter-active {
  transition:
    opacity 0.22s cubic-bezier(0, 0, 0.2, 1),
    transform 0.22s cubic-bezier(0, 0, 0.2, 1);
}

.wizard-step-leave-active {
  transition: opacity 0.14s cubic-bezier(0.4, 0, 1, 1);
}

.wizard-step-enter-from {
  opacity: 0;
  transform: translateX(16px);
}

.wizard-step-leave-to {
  opacity: 0;
}

@keyframes pulseGlow {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.06);
    opacity: 0.82;
  }
}

@keyframes spinRing {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
