# Data Assets

## 目标

这个项目已经不只是“分析 GitHub 仓库”，而是在持续产出三类长期资产：

1. 决策资产：告诉前端、日报、Telegram“今天最值得看什么”
2. 学习资产：告诉本地模型“哪里判断错了，应该怎么改”
3. 运行资产：记录系统怎么跑、哪里失败、哪些数据需要清理

本文件的目标，是把这些资产的语义收口清楚，让后续前端展示、数据导出、训练集构造和清理策略都围绕同一套口径推进。

## 数据分层

### 1. 核心资产 Core Asset

来源：

- `Repository`
- `RepositoryAnalysis`
- `manualOverride`
- `claudeReview`
- `DailyRadarSummary`

核心对象：

- `finalDecision`
- `finalDecision.decisionSummary`
- `coreAsset`

用途：

- 驱动首页列表
- 驱动详情页第一屏
- 驱动 Daily Summary
- 驱动 Telegram top items
- 驱动高价值项目导出

关键原则：

- 前端不再自己拼三层 JSON
- `manualOverride > ClaudeReview > insightJson > fallback`
- `finalDecision` 是唯一真相源
- `decisionSummary` 是首页、详情页、Daily Summary、Telegram 共用的人话摘要层

### 2. 分析资产 Analysis Asset

来源：

- `ideaSnapshotJson`
- `completenessJson`
- `ideaFitJson`
- `extractedIdeaJson`
- `insightJson`

统一挂载：

- `analysisAssets[]`

每一项都带：

- `assetType`
- `analysisLevel`
- `payload`
- `updatedAt`

用途：

- 给详情页后置证据层使用
- 给训练导出和人工复盘使用

### 3. 学习资产 Training Asset

来源：

- Claude `trainingHints`
- Claude audit
- local vs Claude diff
- fallback replay diff

统一挂载：

- `trainingAsset`

内容包括：

- 本地初判 vs Claude 复核
- mistake types
- suggestions
- shouldTrain
- audit problem types
- fallback replay diff

用途：

- 训练集构造
- 高频误判归档
- 本地模型 prompt / heuristic 增强

### 4. 运行资产 Runtime Asset

来源：

- `JobLog`
- 原始 provider response
- warning / runtime state

这类资产不应该无限堆积，需要 retention policy。

## 各表作用

### `Repository`

仓库主实体，保存 GitHub 元信息、粗筛分数、机会分和基础分类。

### `RepositoryAnalysis`

分析主表，保存 snapshot / deep / insight / Claude review / manual override 等结果。

### `RepositoryContent`

README、文件树、根文件、运行相关内容，服务于分析链路和详情页。

### `DailyRadarSummary`

日报快照层，把当天高价值结果、分类分布、关键词组和 Telegram 发送状态收口。

### `JobLog`

运行审计层，记录队列任务、执行结果、错误和重试信息。

### `SystemConfig`

运行时知识与状态层，保存：

- Claude audit latest
- training knowledge
- money learning
- Claude runtime state
- adaptive concurrency state

## 哪些长期保留

长期保留：

- `Repository`
- `RepositoryAnalysis`
- `RepositoryContent`
- `DailyRadarSummary`
- `SystemConfig` 中的知识与状态
- `docs/training-knowledge/` 下的长期文档与数据集

按版本沉淀：

- 导出的训练样本
- 审计报告
- 高频错误归档

## 哪些会清理

运行资产需要 retention：

- `JobLog` 成功记录：45 天
- `JobLog` 失败记录：14 天
- 原始 provider `rawResponse`：14 天
- 临时 warning / 调试输出：按运行期策略清理

说明：

- 当前这轮先把 retention 规范和展示口径收口到文档与导出层
- 真正的定时清理任务可以在后续独立包里加，不影响现有 live worker

## 最终决策对象

统一方法：

- `resolveFinalRepositoryDecision(...)`

统一输出：

- `finalDecision`
- `coreAsset`
- `analysisAssets`
- `trainingAsset`

其中 `finalDecision` 必须至少覆盖：

- 中文一句话
- verdict
- action
- category
- moneyPriority
- reasonZh
- source
- hasConflict
- needsRecheck

## 如何导出

新增导出接口：

- `/api/export/top-projects`
- `/api/export/training-data`
- `/api/export/audit-report`

用途：

- `top-projects`：给运营、筛选和人工看盘
- `training-data`：给后续训练集构造
- `audit-report`：给系统巡检和规则调整

首页已经接入对应导出按钮，支持直接下载：

- 高价值项目
- 训练数据
- 审计报告

## 如何训练模型

训练不要直接拿所有原始 JSON 去喂。

建议优先从这三类资产里构造数据集：

1. `finalDecision`
用途：
- 训练项目现实判断
- 训练 verdict / action
- 训练赚钱优先级

2. `trainingAsset`
用途：
- 训练纠偏能力
- 训练边界案例
- 训练“哪里错了”

3. `analysisAssets`
用途：
- 提供任务级输入
- 支撑中文表达与判断解释

训练构造建议：

- 先做 Gold + Conflict 两层
- 先保证项目现实分类和最终动作判断稳定
- 再训练中文表达和偏好排序

## 与前端的关系

前端现在只应该优先消费：

- `finalDecision`
- `coreAsset`
- `trainingAsset`

不应该再把这些内部字段直接暴露成主视线：

- `toolLike`
- `anchorMatch`
- `strictNonGood`
- provider / fallback / internal warnings

主视线必须始终是：

- 这项目是干嘛的
- 值不值得做
- 更适合做、抄还是跳过
- 为什么

## 与训练知识库的关系

`docs/training-knowledge/` 是长期知识库。

这里的 `DATA_ASSETS.md` 是总纲：

- 定义资产层次
- 定义保留/清理边界
- 定义前端与导出的唯一口径

`docs/training-knowledge/` 负责长期沉淀：

- weekly audits
- mistake patterns
- repo cases
- datasets
- training specs

两者必须口径一致：

- Markdown 给人看
- JSONL 给机器用
- `finalDecision` 是两边的共同锚点
