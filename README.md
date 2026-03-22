# GitDian

GitDian 是一个 GitHub 仓库分析管理系统，用来发现、筛选、分析和沉淀“值得创业重做”的 GitHub 项目。

当前已经具备：
- GitHub 仓库采集，支持 `updated / created`
- Fast Filter 粗筛
- Completeness / Idea Fit / Idea Extract
- 单仓库 / 批量统一分析编排
- JobLog + BullMQ 后台任务
- 首页、详情页、收藏页、设置页、任务页
- 纯本地 AI 模式，默认走 OMLX

## 技术栈

- Monorepo + `pnpm workspace`
- Web: `Next.js` + `TypeScript` + `Tailwind CSS`
- API: `NestJS` + `TypeScript`
- DB: `PostgreSQL` + `Prisma`
- Queue: `BullMQ` + `Redis`
- Local AI: `oMLX`

## 目录结构

```text
.
├── apps
│   ├── api
│   └── web
├── packages
│   └── shared
├── .env.example
├── docker-compose.yml
├── package.json
└── README.md
```

## 本地依赖

至少需要：
- PostgreSQL
- Redis
- oMLX

如果你只想先把基础系统跑起来，不强求 AI 成功路径，也可以先不启动 oMLX；但完整演示建议全部准备好。

## 环境变量

推荐先复制：

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

关键变量：

```bash
# Web
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001

# API
PORT=3001
WEB_ORIGIN=http://localhost:3000

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gitdian?schema=public

# Queue
REDIS_URL=redis://localhost:6379
ENABLE_QUEUE_WORKERS=false

# GitHub
GITHUB_TOKEN=
GITHUB_API_BASE_URL=https://api.github.com

# Local AI
OMLX_BASE_URL=http://localhost:11434
OMLX_MODEL=Qwen3.5-122B-A10B-MLX-9bit-finetuned
OMLX_API_KEY=

# Optional OpenAI fallback
OPENAI_API_KEY=
OPENAI_MODEL=
OPENAI_BASE_URL=

# AI routing
AI_DEFAULT_PROVIDER=omlx
AI_FALLBACK_PROVIDER=omlx
AI_ENABLE_FALLBACK=false
```

## 启动顺序

### 1. 启动 PostgreSQL 和 Redis

如果你本地已经装好了服务，可以直接用本地实例。

如果想快速启动基础依赖：

```bash
docker compose up -d postgres redis
```

### 2. 准备数据库

```bash
pnpm install
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate:dev --name init
```

如果是已有 migration 的环境：

```bash
pnpm --filter api prisma:migrate:deploy
```

### 3. 启动 oMLX

确保本地 OMLX 服务已可用，并且 `OMLX_BASE_URL / OMLX_MODEL` 配置正确。

### 4. 启动 API / Web / Worker

前端和 API：

```bash
pnpm dev
```

单独启动 worker：

```bash
pnpm dev:worker
```

如果你使用生产构建：

```bash
pnpm --filter api build
pnpm --filter web build
pnpm --filter api start
pnpm --filter api start:worker
pnpm --filter web start
```

## 后台任务模式

这些操作现在默认建议走后台任务：
- GitHub 采集
- 单仓库统一分析
- 批量分析
- 批量 Fast Filter

前端会创建任务并跳去 `/jobs` 查看状态，而不是同步等待大任务跑完。

## 本地 AI 模式说明

系统当前默认是“纯本地 AI 模式”：
- `defaultProvider = omlx`
- `fallback = false`
- `rough_filter / completeness / idea_fit / idea_extract` 默认都走 `omlx`

OpenAI 代码和配置仍然保留，但现在是可选增强，不是运行必需依赖。

## 演示路径建议

推荐按下面顺序演示：

1. 打开首页，查看统计卡片、最近任务、工作流提示卡
2. 用 GitHub 一键采集触发后台任务
3. 进入 `/jobs` 查看任务状态
4. 打开某个仓库详情页，触发单仓库分析任务
5. 查看 Completeness / Idea Fit / Idea Extract 更新结果
6. 把高机会项目加入收藏，并在收藏页编辑备注与优先级
7. 到 `/settings` 查看健康检查和系统配置

## 常用命令

- `pnpm dev`
- `pnpm dev:web`
- `pnpm dev:api`
- `pnpm dev:worker`
- `pnpm --filter api prisma:generate`
- `pnpm --filter api prisma:migrate:dev --name <name>`
- `pnpm --filter api build`
- `pnpm --filter api lint`
- `pnpm --filter web typecheck`
- `pnpm --filter web lint`
- `pnpm --filter web build`

## 当前边界

当前刻意没做：
- websocket
- Bull Board / 复杂队列监控面板
- 多用户权限系统
- 复杂 dashboard
- saved views
- embedding / 向量检索推荐

这个仓库当前目标是“本地可运行、可演示、可继续迭代”的单人工作台，而不是一次性做成重型平台。
