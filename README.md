# CharacterArc

CharacterArc 是一个本地优先的 AI 小说创作桌面应用，面向需要长期维护项目设定、角色关系、剧情结构与章节正文的创作者。

它不是“只会对话的 AI 壳子”，而是一套围绕小说项目组织、章节写作与 AI 协作搭起来的桌面工作台：

- 本地优先：项目数据保存在本机 SQLite
- 项目隔离：每个项目独立维护设定、章节、知识库、流程文档与 AI 运行记录
- 双窗口协作：主写作窗口之外，支持独立 AI 助手窗口
- 章节导向：大纲、灵感、知识和 AI 能力最终都围绕章节创作落地

## 功能概览

### 项目与资料

- 项目中心：创建、查看、编辑、删除小说项目
- 新建项目向导：填写题材、篇幅、简介，并可调用 AI 生成首批设定与大纲
- 小说流程面板：按分卷维护流程文档，并支持参考作品拆解
- 知识中心：沉淀项目事实、流程文档、参考资料与风格分析结果
- 技能系统：支持启用内置 Skill，也支持为单项目导入额外 Skill 包参与 AI 上下文构建

### 世界观与结构

- 世界观 / 角色 / 组织 / 关系管理：维护小说基础设定资产
- 关系图谱：可视化角色关系与组织关联
- 剧情大纲：按分卷组织剧情节点，支持新增、编辑、移动和扩写
- 剧情线索：辅助维护伏笔、悬念和回收计划

### 章节创作

- 独立章节创作页：目录、正文、侧边参考分离布局
- 富文本编辑：基于 TipTap，支持搜索替换、格式化、选区动作
- 自动保存：编辑后进入自动保存队列，本地落盘
- 历史版本：支持手动保存章节快照并回滚
- 阅读模式：以更接近成稿阅读的方式检查节奏与连贯性

### AI 辅助

- 章节润色、续写、改写、节奏调整
- 章节摘要生成、伏笔识别、后续剧情链生成
- AI 初稿流式生成
- 独立助手窗口：同步当前项目、章节和选中文本
- 动作提议机制：AI 可以提出修改方案，由主窗口确认后再真正落地

## 适合谁

- 正在写长篇、需要维护大量设定和角色关系的作者
- 希望把 AI 当成“写作助手”而不是“全文代写器”的用户
- 更看重本地数据可控性，不希望依赖在线 SaaS 后端的团队或个人

## 技术栈

- `Electron`
- `Vue 3`
- `TypeScript`
- `Pinia`
- `Naive UI`
- `electron-vite`
- `TipTap`
- `SQLite`（主进程持久化）
- `Cytoscape`（关系图谱）
- `mammoth`（`.docx` 解析，用于参考作品导入）

## 环境要求

- `Node.js` 18+
- `pnpm` 10+
- Windows 开发环境

说明：

- 当前脚本默认以 Windows 为主要开发环境，`package.json` 中使用了 Windows 的 `set` 语法
- 若要在 macOS / Linux 上开发，建议自行改为 `cross-env` 或调整启动脚本

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 启动开发环境

```bash
pnpm run dev
```

开发模式会同时启动：

- Electron 主进程
- Vite 渲染进程

### 3. 首次进入应用后配置 AI

在应用的“设置”面板中填写：

- AI 提供者 `provider`
- 模型名 `model`
- API Key `apiKey`
- Base URL `baseUrl`

当前实现支持：

- OpenAI 兼容接口
- Anthropic
- Ollama
- 本地或自建 OpenAI-compatible 网关

默认值会根据提供者自动填充，但真正可用与否取决于你的模型服务和密钥配置。

## 常用脚本

```bash
pnpm run dev
pnpm run build
pnpm run preview
pnpm run dist
```

- `pnpm run dev`：启动本地开发环境
- `pnpm run build`：执行类型检查并构建 Electron 应用
- `pnpm run preview`：预览构建结果
- `pnpm run dist`：打包 Windows 安装产物

## 一个典型使用流程

### 1. 创建项目

- 填写标题、题材、篇幅、简介
- 可选择空白创建
- 也可以调用 `project-bootstrap` 生成首批设定与大纲

### 2. 维护设定资产

- 在世界观、角色、组织、关系、灵感和知识中心中补齐基础资料
- 这些内容会成为章节创作与 AI 调用的重要上下文

### 3. 规划剧情与分卷

- 先建立分卷结构
- 再补剧情节点、冲突、推进摘要
- 最后将章节与对应的大纲节点绑定

### 4. 进入章节写作

- 在独立创作页编辑正文
- 使用自动保存、版本快照、阅读模式检查成稿
- 需要时调用章节 AI 能力辅助改写、续写或生成人物/节奏建议

### 5. 与助手协作

- 助手窗口会同步当前项目、章节和选中文本
- 它既可以直接输出文本，也可以返回“动作提议”
- 动作提议由主窗口确认后再真正写入正文、大纲或流程文档

## AI 能力说明

AI 调用统一发生在主进程，避免在渲染层直接暴露敏感配置。

当前主要任务包括：

- `project-bootstrap`：创建项目时生成初始设定与大纲
- `chapter-assistant`：章节润色、续写、改写、问答
- `chapter-first-draft`：整章初稿生成
- `chapter-scene-plan`：初稿前的场景规划
- `chapter-summarize`：生成章节摘要
- `plot-thread-detect`：识别当前章节中的伏笔或剧情线
- `assistant-intent` / `assistant-action-proposal`：让独立助手判断意图并生成待确认动作
- `reference-style-chunk` / `reference-style-analysis`：分析导入参考作品的风格

章节相关任务会自动结合当前项目的知识文档做一次本地检索，再把命中的上下文拼入 Prompt。

## 数据存储与本地文件

应用运行后会在 Electron 用户目录下创建本地数据目录：

- 数据目录：`<userData>/data`
- SQLite 数据库：`<userData>/data/workspace.db`

另外，项目级导入 Skill 会存放在：

- `<userData>/project-skills/<project-scope>`

当前数据库保存的核心数据包括：

- 项目摘要
- 世界观条目
- 角色、组织、关系与成员归属
- 分卷与大纲节点
- 章节正文与章节版本
- AI 消息记录
- 知识文档
- AI 运行记录
- 应用设置
- 每卷流程文档

当前实现采用“完整工作区快照写回”策略：

- 渲染层使用 Pinia 维护完整状态
- 主进程接收快照后以事务方式写回 SQLite

这套方案实现简单、稳定，但后续仍有继续演进为更细粒度增量写入的空间。

## 架构说明

应用主要由三层组成：

### 1. Electron 主进程

- 创建主窗口和助手窗口
- 注册 IPC 接口
- 负责 SQLite 读写
- 统一执行 AI 请求、流式输出和模型探测

### 2. Preload 桥接层

- 通过 `window.characterArc` 暴露安全的 IPC API
- 渲染层只能通过桥接访问文件、窗口、AI 与持久化能力

### 3. Vue 渲染层

- 使用 Pinia 维护完整工作区状态
- 启动时先从 SQLite 水合状态，再挂载界面
- 用户操作先更新 Store，再通过防抖持久化同步回主进程

一个典型数据链路：

`启动应用 -> 主进程建窗 -> 渲染层初始化 Store -> 从 SQLite 加载工作区 -> 用户编辑章节 -> Pinia 更新状态 -> 自动保存写回 SQLite -> AI 请求统一由主进程调用`

## 目录结构

```text
CharacterArc/
├─ docs/                        # 产品文档、流程资料、阶段记录
├─ electron/
│  ├─ main/                     # 主进程、SQLite、IPC、AI runtime、窗口管理
│  └─ preload/                  # 渲染层桥接 API
├─ renderer/
│  └─ src/
│     ├─ components/            # 业务组件
│     ├─ features/              # 功能模块与上下文拼装逻辑
│     ├─ pages/                 # 页面级视图
│     ├─ stores/                # Pinia Store
│     ├─ styles/                # 全局样式
│     ├─ theme/                 # 主题与设计令牌
│     ├─ types/                 # 共享类型
│     └─ utils/                 # 工具函数
├─ resources/                   # 应用资源
├─ electron.vite.config.ts      # Electron + Vite 配置
├─ package.json
└─ README.md
```

## 关键入口文件

- `electron/main/index.ts`：主进程入口
- `electron/main/register-main-ipc.ts`：文件、窗口、导入导出、工作区等 IPC
- `electron/main/ai/ipc.ts`：AI IPC 注册
- `electron/main/ai/runtime/orchestrator.ts`：AI 任务调度入口
- `electron/main/workspace-store.ts`：SQLite 建表、迁移、读写快照
- `electron/main/window-manager.ts`：主窗口 / 助手窗口管理
- `electron/preload/index.ts`：`window.characterArc` 桥接层
- `renderer/src/stores/app.ts`：应用核心状态与持久化调度
- `renderer/src/pages/WorkbenchPage.vue`：项目工作台
- `renderer/src/components/ChaptersPanel.vue`：章节创作主界面
- `renderer/src/components/assistant/ClaudeAssistantSurface.vue`：AI 助手界面
- `renderer/src/features/assistant/useAssistantSession.ts`：助手会话控制

## 当前状态

当前版本已经形成一套可以实际使用的小说创作闭环，重点优势在于：

- 本地优先的数据安全感
- 单项目工作区隔离
- 章节导向的写作体验
- 流程文档、知识中心与 AI 协作结合
- 主窗口与独立助手窗口协同

仍适合继续加强的方向包括：

- 更细粒度的 SQLite 增量写入
- 更完整的批量编辑、排序与跨卷迁移能力
- 更丰富的导入导出格式
- 更强的知识冲突检测、写作审校与一致性校验
- 更成熟的项目 Skill 编排与提示词治理能力

## 相关实现入口

- [electron/main/index.ts](./electron/main/index.ts)
- [electron/main/workspace-store.ts](./electron/main/workspace-store.ts)
- [electron/main/ai/ipc.ts](./electron/main/ai/ipc.ts)
- [electron/main/ai/runtime/orchestrator.ts](./electron/main/ai/runtime/orchestrator.ts)
- [renderer/src/stores/app.ts](./renderer/src/stores/app.ts)
- [renderer/src/components/ChaptersPanel.vue](./renderer/src/components/ChaptersPanel.vue)
- [renderer/src/features/assistant/useAssistantSession.ts](./renderer/src/features/assistant/useAssistantSession.ts)
