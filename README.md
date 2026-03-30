# GitDian

把 GitHub 开源仓库转成“可筛选、可分析、可跟进”的创业机会工作台。

```text
GitHub Repos
    |
    v
Fetch -> Fast Filter -> AI Analysis -> Async Jobs -> UI / Workflow
              |                |              |
              v                v              v
        rough score     idea outputs     status / retry / cancel
```

GitDian 是一个面向“GitHub 创业机会发现”的本地工作台，用来把公开仓库从采集、粗筛、深度分析到任务追踪、收藏沉淀串成一条可运行闭环。

一句话定位：
基于 GitHub 数据、异步任务系统和本地大模型的创业项目发现与分析台。

它解决的问题：
- GitHub 上项目很多，但“值不值得继续看、值不值得重做、值不值得创业包装”缺少统一工作流
- 大模型分析链路如果没有任务化和可追踪状态，难以稳定演示和持续迭代
- 本地演示和交接时，环境、模型、任务状态和结果页面往往不一致

当前版本已经达到：
- 本地可运行
- 本地可演示
- 可交接
- 可继续迭代

## Why This Project

这个项目要解决的，不是“怎么再看一个 GitHub 仓库”，而是“怎么把大量公开仓库快速收敛成值得继续研究的创业线索”。

普通 GitHub 浏览更像逐页翻仓库、靠人工判断；GitDian 把这件事改造成了一个连续工作流：
- 先采集候选仓库
- 再做 Fast Filter 粗筛
- 再用本地 AI 生成 Completeness / Idea Fit / Idea Extract
- 最后通过 Jobs、收藏和详情页把结果沉淀成可继续推进的清单

它更像一个“开源项目发现与分析工作台”，而不是一个仓库阅读器。

## Key Highlights

- 本地优先：核心 AI 分析已用本地 oMLX 跑通，不依赖云端模型也能完整演示
- 双引擎分工：122B / oMLX 负责跑量与主链路，Claude 负责高价值复核、quality audit、review diff 和记忆化 training hints
- 任务化闭环：GitHub 采集、单仓库分析、批量分析都走异步任务链路，可追踪、可重试、可取消
- 从发现到判断一条链：同一个系统里同时覆盖采集、粗筛、深度分析、收藏、任务审计
- 演示友好：首页、详情页、任务页、设置页已经能展示真实任务与真实分析结果
- 交接友好：README、交付文档、排障文档、环境模板都已收口

## 核心能力

### 1. GitHub 采集
- 支持按 `updated / created` 模式搜索与采集 GitHub 仓库
- 拉取仓库基础信息、README、根目录结构、最近 commits、最近 issues
- 支持直接创建后台采集任务，而不是同步阻塞等待

### 2. Fast Filter
- 先用规则做粗筛，快速判断项目是否更像“工具 / 产品 / 自动化机会”
- 输出 `roughPass / roughLevel / toolLikeScore`
- 支持单仓库和批量任务化执行

### 3. Completeness / Idea Fit / Idea Extract
- `Completeness`：评估完整性、可运行性、工程成熟度
- `Idea Fit`：评估创业机会等级、商业化可能性、决策建议
- `Idea Extract`：把仓库抽象成产品点子、目标用户、MVP 路线和风险
- 支持单仓库和批量编排

### 3.5 Claude 质量总控层
- Claude 当前负责高精度复核，而不是替代本地 oMLX 主流程
- 双引擎职责：
  - 122B / oMLX：`idea_snapshot`、`completeness`、`idea_fit`、`idea_extract`、`insight` 初判
  - Claude：GOOD / 边界项目复核、Daily Summary / Telegram top items 修正、fallback replay、全局质量巡检、training hints 输出
- 已经在做：
  - project reality review
  - top candidate / Daily Summary / Telegram top items 修正
  - fallback 结果回补
  - review diff 沉淀，记录本地 insight 与 Claude 最终判断差异
  - training hints 沉淀，指出本地模型错在哪里、该补哪些规则和 anchors
- 应该做但不进入主跑量主链路：
  - 历史结果巡检
  - 系统性偏差归因
  - 本地模型规则 / prompt / few-shot 改进建议
- 不该让 Claude 做：
  - 批量 snapshot 主流程
  - 全量 deep analysis 主流程
  - GitHub 大规模跑量抓取

### 4. 异步任务系统
- 基于 `Redis + BullMQ + Worker + JobLog`
- GitHub 采集、单仓库分析、批量分析、批量 Fast Filter 都支持异步任务
- 支持 `/jobs` 页面查看任务状态、详情、上下文过滤
- 支持 `Retry / Cancel`

### 5. 收藏与工作流
- 支持收藏仓库、设置优先级、记录备注
- 首页、详情页、任务页之间可通过任务上下文串联
- 详情页支持“一键运行分析”与“分步运行分析”

### 6. Settings / Health Check / JobLog
- `/settings` 可查看数据库、GitHub、AI 健康状态
- `/api/settings/health` 可确认本地依赖是否可用
- `/api/job-logs` 和 `/jobs` 提供任务审计与操作入口

## 技术栈

- Monorepo：`pnpm workspace`
- Web：`Next.js` + `TypeScript` + `Tailwind CSS`
- API：`NestJS` + `TypeScript`
- Database：`Prisma` + `PostgreSQL`
- Queue：`Redis` + `BullMQ`
- Local AI：`oMLX`
- AI API 协议：OpenAI-compatible API

## 目录结构

```text
.
├── apps
│   ├── api
│   └── web
├── docs
├── packages
│   └── shared
├── .env.example
├── docker-compose.yml
├── package.json
└── README.md
```

## 本地前置依赖

至少需要：
- PostgreSQL
- Redis
- oMLX
- Node.js 22+
- pnpm 10+

说明：
- PostgreSQL / Redis 可以用本机服务，也可以用 `docker compose`
- oMLX 需要提供 OpenAI-compatible 接口
- 当前项目默认走本地 AI，不依赖 OpenAI 才能演示

## 环境变量

推荐先复制：

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

### 根目录 `.env`

用途：
- 作为从仓库根目录启动 API / Worker 时的主环境文件
- 推荐在启动 API / Worker 之前先 `source .env`

关键变量：

| 变量 | 用途 | 是否必填 |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Web 请求 API 的地址 | 必填 |
| `PORT` | API 端口 | 必填 |
| `WEB_ORIGIN` | API CORS 允许的前端地址 | 必填 |
| `DATABASE_URL` | PostgreSQL 连接串 | 必填 |
| `REDIS_URL` | Redis 连接串 | 必填 |
| `GITHUB_TOKENS` | 多 GitHub token 池，逗号分隔，推荐用于回溯任务 | 强烈建议 |
| `GITHUB_TOKEN` | GitHub API 提升限流能力 | 可选但建议 |
| `GITHUB_API_BASE_URL` | GitHub API 地址 | 可选 |
| `GITHUB_SEARCH_MAX_CONCURRENCY` | Search API 自适应并发上限，当前推荐上限 `8` | 可选 |
| `GITHUB_SEARCH_MIN_CONCURRENCY` | Search API 自适应并发下限，当前推荐下限 `4` | 可选 |
| `GITHUB_SEARCH_ADJUST_INTERVAL_MS` | Search 并发健康评估周期 | 可选 |
| `GITHUB_BACKFILL_CONCURRENCY` | GitHub 抓取 / backfill worker 并发，建议保守 | 可选 |
| `OMLX_BASE_URL` | 本地 OMLX OpenAI-compatible API 地址 | 本地 AI 演示必填 |
| `OMLX_MODEL` | 当前用于分析的模型名 | 本地 AI 演示必填 |
| `OMLX_API_KEY` | OMLX API key | 本地 OMLX 开启鉴权时必填 |
| `OMLX_TIMEOUT_MS_SNAPSHOT` | `idea_snapshot` 的 OMLX timeout，建议给 122B 更充足的窗口 | 可选 |
| `OMLX_TIMEOUT_MS_DEEP` | deep analysis 的 OMLX timeout，建议显著长于 snapshot | 可选 |
| `OMLX_TIMEOUT_MS_IDEA_EXTRACT` | `idea_extract` 的独立 timeout，建议高于其它 deep 步骤，降低尾部超时 | 可选 |
| `USE_HEAVY_MODEL_FOR_SNAPSHOT` | 是否让 `idea_snapshot` 默认走 `omlxDeep`（122B）而不是 `omlxLight`（9B） | 可选 |
| `AI_DEFAULT_PROVIDER` | 默认 AI provider | 必填 |
| `AI_FALLBACK_PROVIDER` | 回退 provider | 可选 |
| `AI_ENABLE_FALLBACK` | 是否开启回退 | 可选 |
| `IDEA_SNAPSHOT_CONCURRENCY` | `idea_snapshot` worker 并发，建议作为主要吞吐入口 | 可选 |
| `DEEP_ANALYSIS_CONCURRENCY` | 深度分析 worker 并发，建议不高于 snapshot 的一半 | 可选 |
| `IDEA_EXTRACT_MAX_INFLIGHT` | `idea_extract` 在 deep worker 内的局部并发上限，降低最慢步骤抢占深读槽位 | 可选 |
| `CLAUDE_ENABLED` | 是否启用 Claude 高精度复核层 | 可选 |
| `CLAUDE_API_BASE_URL` | Claude / Anthropic Messages API base URL，可兼容中转站 | 可选 |
| `CLAUDE_API_KEY` | Claude API key | 可选 |
| `CLAUDE_MODEL` | Claude 复核模型，默认 `claude-opus-4-6` | 可选 |
| `CLAUDE_TIMEOUT_MS` | Claude 单次复核 timeout | 可选 |
| `CLAUDE_RETRY_MAX` | Claude 失败重试次数 | 可选 |
| `CLAUDE_MAX_TOKENS` | Claude 复核最大输出 token | 可选 |
| `CLAUDE_REVIEW_DAILY_LIMIT` | Claude 每日最大复核量 | 可选 |
| `CLAUDE_REVIEW_MAX_PER_RUN` | 每轮最多复核的 top candidates 数量 | 可选 |
| `CLAUDE_REVIEW_ONLY_FOR_TOP_CANDIDATES` | 是否只复核摘要 Top 候选 | 可选 |
| `CLAUDE_AUDIT_ENABLED` | 是否启用 Claude 全局质量巡检 | 可选 |
| `CLAUDE_AUDIT_INTERVAL_MS` | Claude 自动巡检周期 | 可选 |
| `CLAUDE_AUDIT_SAMPLE_SIZE` | 每次巡检每个集合抽样上限，默认 `50` | 可选 |
| `ENABLE_QUEUE_WORKERS` | 是否在当前进程启 Worker | 通常保持 `false` |

### `apps/api/.env`

用途：
- Prisma 命令和 API 模块本地环境说明
- 字段应与根目录 `.env` 保持同一套含义

### `apps/web/.env`

用途：
- Next.js 前端运行时环境

当前只需要：

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
```

## 当前默认本地 AI 配置

当前已真实验证通过的本地 AI 配置是：

```bash
OMLX_BASE_URL=http://127.0.0.1:8000/v1
OMLX_MODEL=Qwen3.5-122B-A10B-MLX-9bit-finetuned
OMLX_TIMEOUT_MS_SNAPSHOT=120000
OMLX_TIMEOUT_MS_DEEP=180000
OMLX_TIMEOUT_MS_IDEA_EXTRACT=240000
USE_HEAVY_MODEL_FOR_SNAPSHOT=true
```

如果你要启用 Claude 高精度复核层，可以额外配置：

```bash
CLAUDE_ENABLED=false
CLAUDE_API_BASE_URL=
CLAUDE_API_KEY=
CLAUDE_MODEL=claude-opus-4-6
CLAUDE_TIMEOUT_MS=120000
CLAUDE_RETRY_MAX=2
CLAUDE_MAX_TOKENS=1200
CLAUDE_REVIEW_DAILY_LIMIT=50
CLAUDE_REVIEW_MAX_PER_RUN=10
CLAUDE_REVIEW_ONLY_FOR_TOP_CANDIDATES=true
CLAUDE_AUDIT_ENABLED=true
CLAUDE_AUDIT_INTERVAL_MS=21600000
CLAUDE_AUDIT_SAMPLE_SIZE=50
```

如果你的 oMLX 开启了 API key 鉴权，还需要配置：

```bash
OMLX_API_KEY=<your-local-omlx-api-key>
```

可以用下面两条命令确认服务和模型是否真实可用：

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/v1/models -H "Authorization: Bearer <YOUR_OMLX_API_KEY>"
```

## GitHub 多 Token 建议

当前版本支持两种 GitHub 鉴权输入：
- `GITHUB_TOKENS=token1,token2,token3,token4`
- `GITHUB_TOKEN=token1`

优先级：
- 如果配置了 `GITHUB_TOKENS`，系统优先启用多 token 池
- 如果没有 `GITHUB_TOKENS`，才回退到单 `GITHUB_TOKEN`
- 如果两者都为空，系统会进入匿名模式，但这只适合很轻的手动测试

推荐：
- 365 天回溯优先使用 `GITHUB_TOKENS`
- 单 token 只适合轻量调试，不适合长期跑回溯
- `GITHUB_SEARCH_MAX_CONCURRENCY` 建议从 `4` 起步；如果 token 池和 Search 仍稳定，可再试 `5~6`
- `GITHUB_BACKFILL_CONCURRENCY` 建议先从 `1` 开始，确认稳定后再升到 `2`
- `idea_snapshot` 当前默认就走 `omlxDeep`（122B）；`omlxLight`（9B）只保留给 fallback / debug / 低资源模式
- `IDEA_SNAPSHOT_CONCURRENCY` 建议默认 `12`，这是当前机器上兼顾稳定性和吞吐的更稳起点
- `DEEP_ANALYSIS_CONCURRENCY` 建议默认 `6`，并保持 `<= IDEA_SNAPSHOT_CONCURRENCY / 2`
- `OMLX_TIMEOUT_MS_SNAPSHOT` 建议先从 `120000` 起步
- `OMLX_TIMEOUT_MS_DEEP` 建议明显长于 snapshot，建议先从 `180000` 起步
- `OMLX_TIMEOUT_MS_IDEA_EXTRACT` 建议单独拉长到 `240000`，因为它通常是最慢的 deep 步骤
- `IDEA_EXTRACT_MAX_INFLIGHT` 建议先从 `2` 起步，避免 `idea_extract` 抢满整个 deep worker
- `USE_HEAVY_MODEL_FOR_SNAPSHOT=true` 时，`idea_snapshot` 默认走 `omlxDeep`；改成 `false` 才会回退到 9B
- 当前实测里，`snapshot=16` 在纯 snapshot 基准下也稳定，但 `12/6` 已经通过了带 deep analysis 的真实联动验证，更适合作为默认值

安全提醒：
- 不要把 GitHub token 提交到仓库
- 不要把 token 贴到聊天工具或 issue
- token 泄露后应立即 rotate / revoke

从 4 个 token 扩到 10 个 token 不需要改代码，只需要更新：

```bash
GITHUB_TOKENS=token1,token2,token3,token4,token5,token6,token7,token8,token9,token10
```

## Daily Autonomous Radar

当前版本已经支持 daily autonomous radar，用来把“手动 backfill”升级成“每天自动运行、自动补历史、自动追新、自动沉淀结果”的工具机会雷达。

## Claude 高精度复核层

当前版本支持把 Claude 作为“高精度复核层”接在本地 OMLX 判断之后，但不会替换本地主链路。

设计原则：
- `idea_snapshot / completeness / idea_fit / idea_extract` 继续由本地 OMLX 承担
- Claude 只复核少量高价值候选，例如：
  - 本地判为 `GOOD`
  - 本地判为 `OK` 但 `confidence` 偏低
  - `projectReality` 与 `anchorMatch` 冲突
  - Daily Summary Top 候选
- 最终判断优先级：
  - `manualOverride > ClaudeReview > insightJson > fallback`

Claude 复核不会改写原始 `insightJson`，而是写入 `RepositoryAnalysis.claudeReviewJson` 及审计字段。

如果你使用官方 Anthropic API：

```bash
CLAUDE_ENABLED=true
CLAUDE_API_BASE_URL=
CLAUDE_API_KEY=<your-anthropic-key>
CLAUDE_MODEL=claude-opus-4-6
```

如果你使用兼容 Anthropic Messages API 的中转站：

```bash
CLAUDE_ENABLED=true
CLAUDE_API_BASE_URL=https://your-proxy.example.com
CLAUDE_API_KEY=<your-proxy-key>
CLAUDE_MODEL=claude-opus-4-6
```

建议：
- 只把 Claude 用作 review / judge，不要替代全量本地分析
- 用 `CLAUDE_REVIEW_DAILY_LIMIT` 和 `CLAUDE_REVIEW_MAX_PER_RUN` 控制成本
- 开启 `CLAUDE_REVIEW_ONLY_FOR_TOP_CANDIDATES=true`，优先复核真正进入日报和 Top 候选的项目

核心思路：
- Worker 启动后，如果 `ENABLE_CONTINUOUS_RADAR=true`，会自动启动 radar scheduler
- scheduler 会先跑 `bootstrap`：从 `RADAR_BOOTSTRAP_DAYS` 对应的起点，按天持续补历史窗口
- 历史跑完后切到 `live`：持续滚动补最近 `RADAR_LIVE_LOOKBACK_DAYS` 天的新项目
- 状态会持久化到 `SystemConfig`，所以 worker 重启后会从上次 cursor 继续，不会每次都从一年前重来

当前推荐配置：

```bash
ENABLE_CONTINUOUS_RADAR=true
RADAR_BOOTSTRAP_DAYS=30
RADAR_LIVE_LOOKBACK_DAYS=1
RADAR_SCHEDULER_INTERVAL_MS=4000
RADAR_BOOTSTRAP_FAST_START=true
SNAPSHOT_QUEUE_LOW_WATERMARK=6
SNAPSHOT_QUEUE_HIGH_WATERMARK=24
DEEP_QUEUE_LOW_WATERMARK=2
DEEP_QUEUE_HIGH_WATERMARK=8
SNAPSHOT_REFRESH_DAYS=14
DEEP_ANALYSIS_REFRESH_DAYS=30
CONTINUOUS_DEFAULT_LANGUAGE=TypeScript
CONTINUOUS_DEFAULT_STAR_MIN=1
CONTINUOUS_DEFAULT_PER_WINDOW_LIMIT=10
CONTINUOUS_DEFAULT_TARGET_CATEGORIES=tools,ai,data,infra
RADAR_KEYWORD_MODE_ENABLED=false
RADAR_KEYWORD_STRATEGY=balanced
RADAR_KEYWORD_LOOKBACK_DAYS=14
RADAR_KEYWORD_PER_QUERY_LIMIT=10
RADAR_KEYWORD_SEARCH_CONCURRENCY=2
RADAR_MAINTENANCE_INTERVAL_MS=600000
LOG_ROTATE_MAX_BYTES=20971520
LOG_ROTATE_KEEP_FILES=14
FAILED_JOBLOG_RETENTION_DAYS=14
SUCCESS_JOBLOG_RETENTION_DAYS=45
ANALYSIS_RAW_RESPONSE_RETENTION_DAYS=14
```

这些值的语义：
- `RADAR_BOOTSTRAP_FAST_START`：continuous bootstrap 的冷启动加速开关。开启后，会优先使用更收敛的默认参数，先把 snapshot 队列喂进有效产出区间
- `SNAPSHOT_QUEUE_LOW_WATERMARK / HIGH_WATERMARK`：控制什么时候继续补 GitHub backfill，什么时候暂停补给
- `DEEP_QUEUE_LOW_WATERMARK / HIGH_WATERMARK`：控制什么时候从已有 snapshot promising 结果里补 deep analysis
- `SNAPSHOT_REFRESH_DAYS`：已经有 recent snapshot 且 insight 完整时，多少天内不重复跑
- `DEEP_ANALYSIS_REFRESH_DAYS`：deep analysis 的冷却窗口；如果已有人工判断，也会尽量避免频繁重跑
- `CONTINUOUS_DEFAULT_LANGUAGE / STAR_MIN / PER_WINDOW_LIMIT / TARGET_CATEGORIES`：只作用于 continuous mode 自动调度的默认收敛策略，用来让 bootstrap 冷启动更快进入“有候选、有 snapshot、有 deep”的状态；不会改变手动 backfill 接口的原语义
- `GITHUB_SEARCH_MAX_CONCURRENCY / MIN_CONCURRENCY / ADJUST_INTERVAL_MS`：GitHub Search 自适应并发控制器，会在 `8 / 6 / 4` 三档之间调速，优先平衡 token pool 健康和 122B 的供给节奏
- `RADAR_KEYWORD_*`：关键词供给层配置。created backfill 继续负责完整历史与追新主线，keyword search 负责在 snapshot 队列偏空时更快补出工具类候选
- 每日摘要会自动沉淀到 Daily Summary 层，可通过 `GET /api/github/radar/daily-summary?days=7` 读取最近 N 天的自动运行结果
- `RADAR_MAINTENANCE_INTERVAL_MS`：后台维护周期。worker 会低频执行日志轮转、低价值数据清理，以及 daily summary 自愈同步
- `LOG_ROTATE_MAX_BYTES / LOG_ROTATE_KEEP_FILES`：launchd 日志的轻量轮转策略。当前做法是复制当前日志到带时间戳的归档文件后再原地截断，并只保留最近 N 份
- `FAILED_JOBLOG_RETENTION_DAYS / SUCCESS_JOBLOG_RETENTION_DAYS`：低价值 JobLog 的保留周期。不会删除核心 insight、manual override、daily summary
- `ANALYSIS_RAW_RESPONSE_RETENTION_DAYS`：清理旧的 AI 原始响应缓存，减少无效占用，但保留结构化 insight 结果

推荐运行策略：
- Daily Autonomous Radar 建议只在 worker 进程开启，不要在 API 进程里开启
- Search 并发保持 `4` 左右，优先稳住 GitHub token 池
- 自适应搜索并发当前默认会从 `8` 起步，如果 rate limit / retry / latency 压力升高，会自动降到 `6` 或 `4`
- `idea_snapshot` 继续默认走 `omlxDeep`（122B），`omlxLight`（9B）只保留给 fallback / debug
- 保持 `snapshot=12`、`deep=6` 这组默认值，先让持续供给稳定，再慢慢上调
- continuous 冷启动建议先配 `TypeScript + starMin=1` 这组默认收敛参数，等 snapshot 队列进入稳定供给后，再放宽条件
- 如果想让 122B 更持续吃满，可以开启 `RADAR_KEYWORD_MODE_ENABLED=true`，让 keyword search 在 created 主线切片较慢时提供补充候选
- 先用 `RADAR_BOOTSTRAP_DAYS=3~7` 验证连续调度，再扩到 `30`，最后跑 `365`

最小控制接口：
- `POST /api/github/radar/start`
- `POST /api/github/radar/pause`
- `POST /api/github/radar/resume`
- `GET /api/github/radar/status`
- `GET /api/github/radar/daily-summary`
- `GET /api/github/radar/daily-summary/latest`
- `POST /api/github/radar/daily-summary/send-latest`
- `GET /api/system/warnings`

`/api/github/radar/status` 至少会返回：
- 当前模式：`bootstrap / live / paused`
- 当前 bootstrap cursor
- `snapshotQueueSize / deepQueueSize / backfillQueueSize`
- `lastScheduledAt`
- `isRunning`
- `tokenPoolHealth`
- `reposPerMinute / snapshotThroughput / deepThroughput`
- 当前推荐配置快照
- `warnings`
- `currentSearchWindow / currentWindowTotalCount / recentRetryCount / recentRateLimitHits`
- `currentSearchConcurrency / targetSearchConcurrency / adjustmentReason`
- `keywordModeEnabled / currentKeywordStrategy / activeKeywordGroups / keywordGroupStats`
- `maintenance`
- 轻量告警快照可通过 `GET /api/system/warnings` 读取，并会把最近一次只读告警结果写入 `SystemConfig`

Daily Telegram 创业机会日报：
- `ENABLE_DAILY_TELEGRAM_REPORT=false`
- `TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID`：Telegram Bot 推送凭据，默认关闭
- `DAILY_TELEGRAM_REPORT_HOUR / DAILY_TELEGRAM_REPORT_MINUTE / DAILY_TELEGRAM_TIMEZONE`：日报定时发送时间
- 系统会复用现有 Daily Summary，每天自动推送：
  - 今日抓取数
  - snapshot / deep 数
  - Top 值得做
  - Top 可以抄
- 手动补发接口：`POST /api/github/radar/daily-summary/send-latest`
- 发送幂等基于 Daily Summary 的发送状态：同一天成功发送后不会重复乱发

最小备份与恢复：
- 备份入口：[backup.sh](/Users/v188/Documents/gitdian/scripts/backup.sh)
- 备份脚本：[backup-core.sh](/Users/v188/Documents/gitdian/scripts/ops/backup-core.sh)
- 恢复脚本：[restore-core.sh](/Users/v188/Documents/gitdian/scripts/ops/restore-core.sh)
- 恢复说明：[RESTORE.md](/Users/v188/Documents/gitdian/docs/RESTORE.md)

推荐先做本地核心备份：

```bash
/Users/v188/Documents/gitdian/scripts/backup.sh
```

会导出：
- `SystemConfig`
- `Repository`
- `RepositoryAnalysis`
- `DailyRadarSummary`

如果要直接覆盖当前数据库恢复，必须显式传 `--force`：

```bash
/Users/v188/Documents/gitdian/scripts/ops/restore-core.sh /path/to/backup-dir --force
```

## 本地启动顺序

### 1. 安装依赖

```bash
pnpm install
```

### 2. 启 PostgreSQL

如果本机已经有 PostgreSQL，直接确认可连即可。

如果没有，可用项目自带依赖：

```bash
docker compose up -d postgres
```

快速检查：

```bash
pg_isready -h 127.0.0.1 -p 5432
```

### 3. 启 Redis

如果本机已经有 Redis，直接确认可连即可。

如果没有，可用项目自带依赖：

```bash
docker compose up -d redis
```

快速检查：

```bash
redis-cli -h 127.0.0.1 -p 6379 ping
```

### 4. 启 oMLX

推荐使用 CLI / server 模式，不依赖 GUI：

```bash
/Applications/oMLX.app/Contents/MacOS/omlx-cli serve \
  --base-path /Users/v188/.omlx \
  --port 8000 \
  --api-key <YOUR_OMLX_API_KEY>
```

快速检查：

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/v1/models -H "Authorization: Bearer <YOUR_OMLX_API_KEY>"
```

### 5. 跑 migration

```bash
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate:deploy
```

### 6. 启 API

说明：
- API / Worker 读取的是当前 shell 环境
- 从仓库根目录启动时，先导入根目录 `.env`

开发模式：

```bash
set -a
source .env
set +a
pnpm --filter api start:dev
```

生产构建模式：

```bash
pnpm --filter api build
set -a
source .env
set +a
pnpm --filter api start
```

### 7. 启 Worker

```bash
set -a
source .env
set +a
pnpm --filter api start:worker
```

### 8. 启 Web

开发模式：

```bash
pnpm --filter web dev
```

生产构建模式：

```bash
pnpm --filter web build
pnpm --filter web start
```

### 9. 基础健康检查

```bash
curl http://localhost:3001/api/health
curl http://localhost:3001/api/settings/health
```

## 5 分钟演示脚本

### 1. 首页
- 打开 `/`
- 看统计卡片、最近任务、工作流卡片
- 说明系统目标是“发现值得创业重做的 GitHub 项目”

### 2. 一键采集
- 在首页用 GitHub 一键采集触发一个后台任务
- 强调现在是异步任务，不再同步阻塞

### 3. 任务页
- 进入 `/jobs`
- 展示任务状态、详情、上下文过滤、`Retry / Cancel`

### 4. 仓库详情页
- 打开一个仓库详情
- 展示 README、目录摘要、粗筛信息、已有分析结果

### 5. 一键分析
- 在详情页触发单仓库全量分析
- 展示 `Fast Filter / Completeness / Idea Fit / Idea Extract`
- 再切到 `/jobs` 看对应 JobLog

### 6. 收藏工作流
- 把高机会仓库加入收藏
- 演示收藏页中的优先级和备注

### 7. 设置页
- 打开 `/settings`
- 展示数据库、GitHub、oMLX 健康检查
- 明确系统当前默认跑本地 AI

## GitHub 回溯运行策略

推荐顺序：
- 先跑 `days=7`，确认 token 池、Search 限流和 snapshot 链路都正常
- 再跑 `days=30`，观察 rate limit、窗口切片和 JobLog 摘要
- 最后再跑 `days=365`

推荐配置：
- 使用 `GITHUB_TOKENS` 多 token 池，而不是单 token
- Search API 现在建议使用自适应并发：
  `GITHUB_SEARCH_MAX_CONCURRENCY=8`
  `GITHUB_SEARCH_MIN_CONCURRENCY=4`
  控制器会按 `8 -> 6 -> 4` 降档，也会在稳定后按 `4 -> 6 -> 8` 升档
- Backfill worker 并发保持保守，建议 `GITHUB_BACKFILL_CONCURRENCY=1`
- `idea_snapshot` worker 并发建议默认 `IDEA_SNAPSHOT_CONCURRENCY=12`
- `deep analysis` worker 并发建议默认 `DEEP_ANALYSIS_CONCURRENCY=6`，并保持不高于 snapshot 的一半
- `idea_snapshot` timeout 建议先从 `OMLX_TIMEOUT_MS_SNAPSHOT=120000` 起步
- `deep analysis` timeout 建议先从 `OMLX_TIMEOUT_MS_DEEP=180000` 起步
- `idea_extract` timeout 建议单独使用 `OMLX_TIMEOUT_MS_IDEA_EXTRACT=240000`
- `idea_extract` 局部并发建议使用 `IDEA_EXTRACT_MAX_INFLIGHT=2`
- `runIdeaSnapshot=true` 全量跑
- `runDeepAnalysis=true`，但只对 `promising / toolLike / targetCategories` 命中的项目深读
- 大回溯时继续采用“122B 全量 snapshot + 122B 深读候选”的分层策略，其中 snapshot 吃并发，deep analysis 控制在较低并发
- 关键词供给层建议保持轻量：
  `RADAR_KEYWORD_MODE_ENABLED=true`
  `RADAR_KEYWORD_SEARCH_CONCURRENCY=2`
  created 主线负责完整性，keyword search 负责在 AI 队列偏空时补速度

## 常用命令

### 根目录

```bash
pnpm dev
pnpm dev:web
pnpm dev:api
pnpm dev:worker
pnpm build
pnpm lint
pnpm typecheck
```

说明：
- `pnpm dev` 只会同时启动 Web + API，不会单独起 Worker
- API / Worker 仍然需要当前 shell 里已经导入正确环境变量

### API

```bash
pnpm --filter api build
pnpm --filter api start
pnpm --filter api start:dev
pnpm --filter api start:worker
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate:deploy
pnpm --filter api lint
pnpm --filter api typecheck
```

### Web

```bash
pnpm --filter web dev
pnpm --filter web build
pnpm --filter web start
pnpm --filter web lint
pnpm --filter web typecheck
```

## 当前能力边界

当前刻意没做：
- websocket 实时任务推送
- Bull Board / 复杂队列监控面板
- 多用户权限与租户系统
- 复杂 dashboard
- saved views
- 推荐系统升级
- embedding / 向量检索增强
- 高并发公网生产化治理

## 未来路线图

下一步可以继续做，但当前版本刻意没有展开：
- websocket 实时任务推送，让 `/jobs` 和详情页自动刷新状态
- 多用户与权限体系，支持团队协作、角色和空间隔离
- 推荐系统升级，把仓库标签、分析结果和收藏行为串成优先级推荐
- embedding / 向量检索，让“相似项目”“相关机会”“主题聚类”更强
- 更完整的运行观测能力，包括任务吞吐、失败分布、模型调用耗时和队列健康

## 当前发布说明

这个项目现在已经达到：
- 本地演示
- 内部试运行
- 继续开发与继续扩展

这个项目当前还不适合：
- 多租户生产 SaaS
- 高并发公网生产环境
- 需要完整权限、审计、监控、告警的正式平台化场景

## 交付文档

- [docs/DELIVERY.md](/Users/v188/Documents/gitdian/docs/DELIVERY.md)：交付、演示、Worker/任务使用说明
- [docs/ARCHITECTURE.md](/Users/v188/Documents/gitdian/docs/ARCHITECTURE.md)：高层架构、模块关系与数据流说明
- [docs/PITCH.md](/Users/v188/Documents/gitdian/docs/PITCH.md)：30 秒 / 2 分钟 / 5 分钟演示话术稿
- [docs/TROUBLESHOOTING.md](/Users/v188/Documents/gitdian/docs/TROUBLESHOOTING.md)：启动与排障手册
- [docs/2026-03-22-codex-chat-recovery.md](/Users/v188/Documents/gitdian/docs/2026-03-22-codex-chat-recovery.md)：历史恢复记录
