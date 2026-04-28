# MuMuAINovel 提示词体系导出

- 文档版本：`v0.1`
- 更新时间：`2026-04-28`
- 来源项目：`MuMuAINovel-main`
- 导出用途：为 `CharacterArc` 后续对标提示词系统、写作风格系统、Prompt 模板体系与工坊能力提供结构参考

## 一、总览

MuMuAINovel 的“提示词相关能力”并不是一个单文件，而是一整套系统，主要由以下几层组成：

1. 系统默认提示词模板
2. 用户自定义提示词模板
3. 写作风格提示词
4. Prompt 工坊
5. AI 业务服务对提示词的消费链路

核心服务入口在：

- [backend/app/services/prompt_service.py](d:/JavaProjects/MuMuAINovel-main/backend/app/services/prompt_service.py)

核心数据模型在：

- [backend/app/models/prompt_template.py](d:/JavaProjects/MuMuAINovel-main/backend/app/models/prompt_template.py)
- [backend/app/models/writing_style.py](d:/JavaProjects/MuMuAINovel-main/backend/app/models/writing_style.py)
- [backend/app/models/prompt_workshop.py](d:/JavaProjects/MuMuAINovel-main/backend/app/models/prompt_workshop.py)

核心 API 在：

- [backend/app/api/prompt_templates.py](d:/JavaProjects/MuMuAINovel-main/backend/app/api/prompt_templates.py)
- [backend/app/api/writing_styles.py](d:/JavaProjects/MuMuAINovel-main/backend/app/api/writing_styles.py)
- [backend/app/api/prompt_workshop.py](d:/JavaProjects/MuMuAINovel-main/backend/app/api/prompt_workshop.py)

---

## 二、系统提示词模板层

### 2.1 核心服务

`PromptService` 是 MuMu 的系统提示词中心，承担：

- 内置系统模板保存
- 模板格式化
- 用户自定义模板优先加载
- 默认模板回退
- 导出系统模板目录

关键能力：

- `format_prompt(template, **kwargs)`
- `get_template(template_key, user_id, db)`
- `get_template_with_fallback(...)`
- `get_all_system_templates()`
- `get_system_template_info(template_key)`

### 2.2 内置模板特征

MuMu 的系统模板已经不是简单一句提示词，而是：

- 大量使用结构化标签
- 带固定输出 JSON 约束
- 面向不同业务场景拆开
- 已经存在“系统提示词 + 用户提示词”双模板结构

例如：

- 小说封面生成
- 世界构建
- 批量角色生成
- 单个角色生成
- 组织生成
- 大纲生成
- 大纲续写
- 章节创作
- 章节重写
- 局部重写
- 情节分析
- MCP 工具测试
- 灵感模式
- 自动角色/组织分析与生成
- 职业体系生成

---

## 三、系统模板目录

根据 [prompt_service.py](d:/JavaProjects/MuMuAINovel-main/backend/app/services/prompt_service.py) 中 `template_definitions` 导出的目录，MuMu 当前至少包含这些模板类别：

### 3.1 基础生成类

- 小说封面生成
- 世界构建
- 批量角色生成
- 单个角色生成
- 组织生成
- 大纲生成
- 大纲续写

### 3.2 章节创作类

- 章节创作-1-N模式（第1章）
- 章节创作-1-N模式（第2章及以后）
- 章节创作-1-1模式（第1章）
- 章节创作-1-1模式（第2章及以后）
- 章节重写系统提示
- 局部重写
- 情节分析

### 3.3 大纲展开类

- 大纲单批次展开
- 大纲分批展开

### 3.4 MCP 与资料增强类

- MCP工具测试(用户提示词)
- MCP工具测试(系统提示词)
- MCP世界观规划
- MCP角色规划

### 3.5 自动引入类

- 自动角色分析
- 自动角色生成
- 自动组织分析
- 自动组织生成

### 3.6 体系生成类

- 职业体系生成

### 3.7 灵感模式类

- 灵感模式-书名生成(系统提示词)
- 灵感模式-书名生成(用户提示词)
- 灵感模式-简介生成(系统提示词)
- 灵感模式-简介生成(用户提示词)
- 灵感模式-主题生成(系统提示词)
- 灵感模式-主题生成(用户提示词)
- 灵感模式-类型生成(系统提示词)
- 灵感模式-类型生成(用户提示词)
- 灵感模式-智能补全

### 3.8 拆书导入类

- 拆书导入-反向项目提炼
- 拆书导入-反向章节大纲

---

## 四、用户自定义模板层

### 4.1 数据模型

MuMu 使用 `prompt_templates` 表保存用户级模板：

字段核心如下：

- `user_id`
- `template_key`
- `template_name`
- `template_content`
- `description`
- `category`
- `parameters`
- `is_active`
- `is_system_default`

参考：

- [backend/app/models/prompt_template.py](d:/JavaProjects/MuMuAINovel-main/backend/app/models/prompt_template.py)

### 4.2 API 能力

MuMu 已经提供比较完整的模板管理 API：

- 获取全部模板
- 按分类获取模板
- 获取系统默认模板
- 获取单个模板
- 创建或更新模板
- 删除模板
- 重置为系统默认
- 导入导出模板
- 模板预览

参考：

- [backend/app/api/prompt_templates.py](d:/JavaProjects/MuMuAINovel-main/backend/app/api/prompt_templates.py)

### 4.3 CharacterArc 可借鉴点

CharacterArc 后续如果补提示词系统，最值得复用的结构不是模板内容本身，而是：

- `template_key` 作为稳定标识
- 用户模板覆盖系统模板
- 支持“重置回默认”
- 分类展示
- 参数定义字段

---

## 五、写作风格体系

### 5.1 数据模型

MuMu 把写作风格单独建模为 `writing_styles`：

字段核心如下：

- `user_id`
- `name`
- `style_type`
- `preset_id`
- `description`
- `prompt_content`
- `order_index`

参考：

- [backend/app/models/writing_style.py](d:/JavaProjects/MuMuAINovel-main/backend/app/models/writing_style.py)

### 5.2 API 能力

MuMu 的写作风格已支持：

- 获取预设风格
- 获取用户所有风格
- 创建风格
- 更新风格
- 删除风格
- 项目默认风格

参考：

- [backend/app/api/writing_styles.py](d:/JavaProjects/MuMuAINovel-main/backend/app/api/writing_styles.py)

### 5.3 与提示词的关系

MuMu 不是把“风格”做成普通标签，而是直接把风格内容拼接进生成提示词：

- `style.prompt_content`
- `style_content`

在章节生成、章节重写、局部重写等链路中实际参与 prompt 构造。

### 5.4 CharacterArc 可借鉴点

CharacterArc 后续补写作风格时，建议直接复用这个思路：

- 风格是一段 prompt 内容
- 项目可以指定默认风格
- 生成时可以附加风格内容

---

## 六、Prompt 工坊体系

### 6.1 数据模型

MuMu 的工坊能力涉及至少三张表：

- `prompt_workshop_items`
- `prompt_submissions`
- `prompt_workshop_likes`

字段核心围绕：

- `prompt_content`
- `category`
- `tags`
- `status`
- `author_display_name`
- `download_count`
- `like_count`

参考：

- [backend/app/models/prompt_workshop.py](d:/JavaProjects/MuMuAINovel-main/backend/app/models/prompt_workshop.py)

### 6.2 API 能力

MuMu 的 Prompt 工坊已经不是本地模板，而是偏社区系统：

- 获取工坊列表
- 获取单项详情
- 导入到本地写作风格
- 点赞
- 提交提示词
- 我的提交
- 撤回 / 删除提交
- 管理员审核
- 官方提示词发布

参考：

- [backend/app/api/prompt_workshop.py](d:/JavaProjects/MuMuAINovel-main/backend/app/api/prompt_workshop.py)
- [backend/app/services/workshop_client.py](d:/JavaProjects/MuMuAINovel-main/backend/app/services/workshop_client.py)

### 6.3 CharacterArc 可借鉴点

如果 CharacterArc 将来只做本地桌面版，这一层可以明显后置。  
但可以先借鉴它的两件事：

- `prompt_content + category + tags` 这套结构
- “导入工坊内容到本地风格”的映射关系

---

## 七、提示词在业务链中的使用方式

MuMu 的提示词体系并不是静态展示，而是深度嵌入业务服务中。

### 常见使用链路

- 世界观生成
- 角色生成
- 大纲生成
- 章节生成
- 章节重写
- 局部重写
- 情节分析
- 灵感模式
- MCP 工具测试

### 代表性服务文件

- [backend/app/services/prompt_service.py](d:/JavaProjects/MuMuAINovel-main/backend/app/services/prompt_service.py)
- [backend/app/services/plot_expansion_service.py](d:/JavaProjects/MuMuAINovel-main/backend/app/services/plot_expansion_service.py)
- [backend/app/services/plot_analyzer.py](d:/JavaProjects/MuMuAINovel-main/backend/app/services/plot_analyzer.py)

### CharacterArc 可借鉴点

对于 CharacterArc，更值得迁移的是“提示词架构”：

- 系统模板键值化
- 用户模板覆盖
- 风格内容独立存储
- 业务服务按场景读取模板

而不是简单复制某一个长 prompt 文本。

---

## 八、CharacterArc 后续接入建议

如果要把 MuMu 的提示词体系迁到 CharacterArc，建议分三步：

### 第一步

先做系统模板注册表：

- `template_key`
- `template_name`
- `template_content`
- `description`
- `category`

### 第二步

做用户自定义模板覆盖机制：

- 自定义模板表
- 系统默认模板回退
- 模板编辑 / 重置

### 第三步

做写作风格与业务生成联动：

- 风格存为 `prompt_content`
- 生成链路自动拼接
- 项目默认风格

Prompt 工坊可以后置。

---

## 九、结论

MuMuAINovel 的提示词系统已经是完整体系，不是单一“提示词列表”：

- 有系统模板层
- 有用户覆盖层
- 有风格系统
- 有工坊系统
- 有深度业务链路接入

对于 CharacterArc 而言，最值得导出的不是全部 prompt 原文，而是：

- 模板分类结构
- 数据模型设计
- 用户覆盖机制
- 风格与生成的耦合方式
- 工坊与本地风格之间的映射关系

本文件可作为 CharacterArc 后续补齐提示词体系时的结构参考。

