# CharacterArc

CharacterArc（弧光）是一个本地优先的 AI 小说创作桌面应用，面向需要长期维护项目设定、角色关系、剧情结构与章节正文的创作者。

它不是"只会对话的 AI 壳子"，而是一套围绕小说项目组织、章节写作与 AI 协作搭起来的桌面工作台：

- **本地优先** — 项目数据保存在本机 SQLite，无需依赖在线服务
- **项目隔离** — 每个项目独立维护设定、章节、知识库与 AI 运行记录
- **章节导向** — 大纲、灵感、知识和 AI 能力最终都围绕章节创作落地
- **Skill 驱动** — AI 调用可按任务自动匹配内置 / 项目级 Skill 包，并支持 Agent Loop 调度
- **多厂商接入** — 支持 DeepSeek、通义千问、智谱 GLM、Kimi、SiliconFlow、OpenAI、Anthropic、Ollama 以及 New API / One API 网关

## 功能概览

### 项目与资料

- 项目中心：创建、查看、编辑、删除小说项目
- 新建项目向导：填写题材、篇幅、简介，可调用 AI 生成首批设定与大纲
- 小说流程面板：按分卷维护流程文档，支持参考作品拆解
- 知识中心：沉淀项目事实、流程文档、参考资料与风格分析结果
- 技能系统：支持启用内置 Skill，也支持为单项目导入额外 Skill 包

### 世界观与结构

- 世界观 / 角色 / 组织 / 关系管理：维护小说基础设定资产
- 关系图谱：可视化角色关系与组织关联（Cytoscape）
- 剧情大纲：双栏交错时间线布局，按分卷组织剧情节点，支持拖拽排序与 AI 扩写
- 剧情线索：辅助维护伏笔、悬念和回收计划

### 章节创作

- 三栏布局：目录树 + 正文编辑器 + AI 侧边栏
- 富文本编辑：基于 TipTap，支持搜索替换、格式化、选区动作
- 自动保存与历史版本：编辑后自动落盘，支持手动快照与回滚
- 阅读模式 / 专注模式：以更接近成稿阅读的方式检查节奏
- 字数目标：按章节设置目标字数并跟踪完成度
- 导出：章节正文可导出为 `.txt` / `.docx`，工作区可导出 JSON 快照

### AI 辅助

- 章节润色、续写、改写、节奏调整
- 章节摘要生成、伏笔识别、后续剧情链生成
- AI 初稿流式生成、场景规划、章节分析
- 灵感发散包生成、参考作品深度拆解
- Agent Loop 模式：让模型按 Skill 索引与工具注册表循环思考
- 任务进度面板：统一查看正在运行与历史 AI 任务

### 封面工作台

- 面向平台（番茄、起点、晋江、知乎盐言、七猫、刺猬猫等）生成封面 Prompt
- 调用图像模型生成预览图，可在工作台中对比历史版本

## 截图

<!-- TODO: 添加应用截图 -->

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Electron + Vue 3 + TypeScript |
| 状态管理 | Pinia |
| UI 组件库 | Naive UI |
| 构建工具 | electron-vite (Vite 7) |
| 富文本编辑 | TipTap |
| 持久化 | SQLite（主进程） |
| 关系图谱 | Cytoscape |
| AI SDK | Vercel AI SDK (@ai-sdk/openai, @ai-sdk/anthropic) |
| 文档解析 | mammoth (.docx)、marked (Markdown) |

## 环境要求

- Node.js 18+
- pnpm 10+
- Windows（当前脚本默认 Windows 环境）

> macOS / Linux 开发需将 `package.json` 中的 `set ELECTRON_RUN_AS_NODE=&&` 替换为 `cross-env ELECTRON_RUN_AS_NODE= `，或直接删除该前缀。

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发环境（同时启动 Electron 主进程 + Vite 渲染进程）
pnpm run dev

# 类型检查 + 构建
pnpm run build

# 打包 Windows 安装程序
pnpm run dist
```

### 配置 AI

首次进入应用后，在「设置」面板中填写：

**文本生成**
- AI 提供者（DeepSeek / 通义千问 / 智谱 / Kimi / SiliconFlow / OpenAI / Anthropic / Ollama / 自定义网关）
- 模型名、API Key、Base URL

**图像生成**（封面工作台使用）
- 图像模型、API Key、Base URL

## 项目结构

```
CharacterArc/
├── electron/
│   ├── main/
│   │   ├── ai/                    # AI 管线
│   │   │   ├── agent/             # Agent Loop、系统提示词、工具注册表
│   │   │   ├── prompts/           # 通用提示词片段
│   │   │   ├── runtime/           # 任务调度、上下文构建
│   │   │   ├── skills/            # Skill 加载与匹配
│   │   │   ├── tasks/             # 各 AI 任务 handler
│   │   │   └── transport/         # 模型传输层（OpenAI 兼容 / Anthropic / 图像）
│   │   ├── index.ts               # 主进程入口
│   │   ├── register-main-ipc.ts   # IPC 注册
│   │   ├── window-manager.ts      # 窗口管理
│   │   ├── workspace-store.ts     # SQLite 建表、迁移、快照读写
│   │   └── knowledge-retrieval.ts # 章节调用前的本地知识检索
│   ├── preload/                   # window.characterArc 桥接层
│   └── shared/                    # 主进程/渲染层共享类型
├── renderer/
│   └── src/
│       ├── components/            # 业务组件
│       │   ├── chapterWorkspace/  # 章节创作工作区
│       │   └── home/              # 首页/项目中心
│       ├── features/              # 功能模块（ai、chapters、cover、knowledge、relations...）
│       ├── pages/                 # 页面级视图
│       ├── stores/                # Pinia Store
│       ├── styles/                # 全局样式
│       ├── theme/                 # 主题与设计令牌
│       ├── types/                 # 共享类型
│       └── utils/                 # 工具函数
├── resources/
│   ├── icon.ico / icon.png        # 应用图标
│   └── skills/                    # 内置 Skill 包
├── electron.vite.config.ts
├── package.json
└── tsconfig.json
```

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                    Electron 主进程                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │ 窗口管理  │  │  SQLite  │  │     AI 管线          │  │
│  │          │  │ 读写/迁移 │  │ 调度 → Skill → 模型  │  │
│  └──────────┘  └──────────┘  └──────────────────────┘  │
├─────────────────── IPC 桥接 ────────────────────────────┤
│                    Vue 渲染层                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │  Pinia   │  │  TipTap  │  │    Naive UI 组件     │  │
│  │  Store   │  │  编辑器  │  │                      │  │
│  └──────────┘  └──────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

数据流：启动 → 主进程建窗 → 渲染层初始化 Store → 从 SQLite 加载工作区 → 用户编辑 → Pinia 更新 → 防抖写回 SQLite → AI 请求统一由主进程调用

## 内置 Skill 包

应用在 `resources/skills/` 下预置了一批可直接启用的 Skill：

| Skill | 用途 |
|-------|------|
| `story-long-write` | 长篇小说写作辅助 |
| `story-long-analyze` | 长篇小说分析 |
| `story-long-scan` | 长篇市场扫描 |
| `story-short-write` | 短篇小说写作辅助 |
| `story-short-analyze` | 短篇小说分析 |
| `story-short-scan` | 短篇市场扫描 |
| `story-cover` | 封面文案与题材拆解 |
| `story-deslop` | 口水话/套路化表达清理 |
| `story-blueprint` | 故事蓝图规划 |
| `humanizer-zh` | 中文去 AI 味润色 |
| `style-fingerprint` | 风格指纹提取 |
| `style-fusion` | 风格融合 |
| `story-chapter-exec` | 章节执行 |
| `story-chapter-repair` | 章节修复 |
| `story-format-tomato` | 番茄小说排版 |

每个项目还可以导入独立的 Skill 包，作用范围仅限该项目。

## 数据存储

应用数据保存在 Electron 用户目录下：

- 数据库：`<userData>/data/workspace.db`（SQLite）
- 项目 Skill：`<userData>/project-skills/<project-scope>`

所有数据完全本地，不上传任何第三方服务。

## 鸣谢

- [oh-story-claudecode](https://github.com/worldwonderer/oh-story-claudecode) — 提供了核心写作 Skills 的方法论与 prompt 工程基础

## License

本项目基于 [MIT License](./LICENSE) 开源。
