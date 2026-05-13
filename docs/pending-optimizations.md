# 待优化事项

> 实施状态：本轮（v2.0 分支）已完成 10 项全部。部分项目（如 #6 状态面板的手动编辑）留了独立子任务。

## 高优先级（影响功能正确性）

### 1. 新检索未接入主流程 ✅ 已完成

- `orchestrator.ts` 的 `chapter-first-draft` / `chapter-assistant` / `chapter-analysis` / `chapter-scene-plan` 已走 `retrieveHybridContext`，注入 `storyStateBlock` + 语义段 `semanticSegmentsBlock`。
- `chapter-first-draft.ts` prompt 已消费 `semanticSegmentsBlock`。
- 语义检索失败（embedding 不可用、查询为空、无索引）会静默退化为仅返回 state block。

### 2. Embedding 兼容性 ✅ 已完成

- [embedding-service.ts](electron/main/ai/embedding-service.ts) 新增 `providerSupportsEmbedding` 检测；Anthropic 被列入不支持清单。
- `indexChapterSegments` / `indexReferenceNovel` / `retrieveSemanticSegments` 都会先做支持性检查，不支持时直接跳过，不再无限重试 API。
- 新增 `EmbeddingUnsupportedError` / `EmbeddingDimensionMismatchError` 便于上层识别失败类型。

### 3. 已有项目状态补录 ✅ 已完成

- 新增 [state-backfill.ts](electron/main/ai/state-backfill.ts) 和 IPC 通道 `characterarc:ai-backfill-state`。
- 知识中心顶部加"从已有章节补录状态"按钮，带进度提示。
- 首次写章节时检测到状态库空并引导用户补录：作为 TODO 留到下一轮（需要在 ChaptersPanel 加空状态检测）。

## 中优先级（影响用户体验）

### 4. 轻检结果展示 ✅ 已完成

- orchestrator 新增 `ChapterStateWarningsPayload` 事件类型 + `setChapterWarningsEmitter` 注入钩子。
- IPC 层广播 `characterarc:chapter-state-warnings`；preload 暴露 `onChapterStateWarnings`。
- store 按章节 ID 缓存告警；[ChaptersPanel.vue](renderer/src/components/ChaptersPanel.vue) 用 `n-alert` 在编辑器上方展示，可关闭。
- 自动修复调用 `chapter-repair` 留作下一轮——`chapter-repair` 还没在任务注册表里注册。

### 5. 深度审计入口 ✅ 已完成

- 知识中心加"一致性审计"按钮，调用 `story-deep-audit` 任务。
- orchestrator 同步给 `story-deep-audit` 注入 `storyStateBlock`。
- 审计报告以 `canon-fact` 类型的知识文档形式归档到知识库。
- 每 50 章自动提醒留到下一轮。

### 6. 状态面板 UI ✅ 部分完成（只读）

- 新增 [StoryStatePanel.vue](renderer/src/components/StoryStatePanel.vue)：n-modal + n-tabs 多标签展示角色状态/活跃伏笔/关系/时间线/世界规则/倒计时。
- 伏笔超期可视化：超过 30 章未回收的伏笔会在顶部 n-alert 提醒。
- IPC `characterarc:ai-read-story-state` 暴露 `buildStoryStateContext` 给前端。
- 知识中心顶部加"世界状态总览"按钮入口。
- **手动编辑 / 修正 AI 提取错误 TODO**：需要一组新的 IPC 通道（update character state、edit foreshadowing、adjust relationship 等），后续单独推进。

### 7. 删除 `未知skills/` 文件夹 ✅ 已完成（见 commit 803fbd3）

## 低优先级（技术债）

### 8. 统一检索模块 ✅ 已完成

- 合并 `electron/main/knowledge-retrieval.ts` 与 `electron/main/ai/knowledge-retrieval-v2.ts` 为统一的 [electron/main/ai/knowledge-retrieval.ts](electron/main/ai/knowledge-retrieval.ts)。
- 旧的两个文件已删除，所有引用已更新。

### 9. Embedding 维度校验 ✅ 已完成

- [embedding-service.ts](electron/main/ai/embedding-service.ts) 按 `${provider}:${model}` 缓存首次观测维度；第二次返回不同维度时抛 `EmbeddingDimensionMismatchError`。
- 新增 `getObservedEmbeddingDimension` 供上层查询。
- 持久化到 `app_settings` 的需求暂缓——运行时内存缓存 + 维度不一致时抛错已经能覆盖"切换模型后需要重建索引"的场景。

### 10. 数据清理 ✅ 已完成

- [workspace-store.ts](electron/main/workspace-store.ts) 的 `writeWorkspaceSnapshot` 事务末尾增加孤儿 `story_embeddings` 清理：按活跃 `chapterId` / `referenceWorkId` 对比删除不再引用的向量段。
- [register-main-ipc.ts](electron/main/register-main-ipc.ts) 的 save-workspace handler 在持久化后做一次孤儿参考原文 TXT 文件清理（`reference-novels/*.txt`）。

---

## 本轮未完成，留作后续

1. **首次写章节时的状态补录提示**：需要在 ChaptersPanel 里检测状态库为空并给出引导。
2. **章节轻检告警的自动修复**：`chapter-repair` 任务还没进入任务注册表，需要先补齐 handler。
3. **状态面板手动编辑**：IPC 通道和 UI 的双向编辑都要做一套。
4. **每 50 章自动审计提醒**：依赖状态面板对章节进度的感知，单独做。
5. **embedding 维度持久化到 app_settings**：当前是进程内内存缓存，重启后需要重新观测。
