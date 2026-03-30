# Delivery Guide

## 当前系统已真实跑通的能力

- PostgreSQL / Redis / API / Worker / Web 已真实启动通过
- Prisma migration 已真实落库
- GitHub 异步采集已真实成功
- Fast Filter 异步任务已真实成功
- 单仓库分析异步任务已真实成功
- 批量分析异步任务已真实成功
- `Completeness / Idea Fit / Idea Extract` 已通过本地 oMLX 真实跑通
- 单仓库四步全量分析已真实成功
- `/jobs` 页面、`Retry`、`Cancel` 已真实验证可用
- 首页、详情页、任务页能看到真实任务与分析结果

## 演示前检查清单

- PostgreSQL 可连：`pg_isready -h 127.0.0.1 -p 5432`
- Redis 可连：`redis-cli -h 127.0.0.1 -p 6379 ping`
- oMLX 健康：`curl http://127.0.0.1:8000/health`
- oMLX 模型列表：`curl http://127.0.0.1:8000/v1/models -H "Authorization: Bearer <YOUR_OMLX_API_KEY>"`
- API 健康：`curl http://localhost:3001/api/health`
- 系统健康：`curl http://localhost:3001/api/settings/health`
- Worker 已启动，并且日志里出现 `Queue workers started (4).`
- Web 已可打开：`http://localhost:3000`

## 演示启动顺序

1. 启 PostgreSQL
2. 启 Redis
3. 启 oMLX
4. 跑 `pnpm --filter api prisma:migrate:deploy`
5. 启 API
6. 启 Worker
7. 启 Web

## 如果某项失败，优先检查什么

### API 起不来
- 是否先 `source .env`
- `DATABASE_URL` 是否正确
- PostgreSQL 是否可连

### Worker 不消费
- Redis 是否可连
- Worker 是否单独启动
- 日志里是否出现 `Queue workers started (4).`

### AI 分析失败
- `/api/settings/health` 中 `ai.omlx.ok` 是否为 `true`
- `OMLX_BASE_URL / OMLX_MODEL / OMLX_API_KEY` 是否正确
- oMLX `/v1/models` 返回里是否真的有该模型

### 前端看不到结果
- 先查 `/api/job-logs`
- 再查 `/api/repositories/:id`
- 再确认 Worker 是否已完成消费

## oMLX 本地模式说明

当前默认本地 AI 配置：

```bash
OMLX_BASE_URL=http://127.0.0.1:8000/v1
OMLX_MODEL=Qwen3.5-122B-A10B-MLX-9bit-finetuned
```

说明：
- 项目通过 OpenAI-compatible API 调用本地 oMLX
- 如果 oMLX 开启鉴权，必须配置 `OMLX_API_KEY`
- 当前默认 provider 是 `omlx`
- OpenAI 保留为可选增强，不是演示必需项

## Worker / 队列任务说明

当前任务化入口包括：
- GitHub 采集
- 单仓库分析
- 批量分析
- 批量 Fast Filter

任务运行链路：
- 前端或 API 创建 JobLog
- BullMQ 入队
- Worker 消费
- JobLog 更新为 `PENDING / RUNNING / SUCCESS / FAILED`
- `/jobs` 页面展示状态与详情

## JobLog / Retry / Cancel 使用说明

### JobLog

- 列表接口：`GET /api/job-logs`
- 详情接口：`GET /api/job-logs/:id`
- 页面入口：`/jobs`

### Retry

- 接口：`POST /api/job-logs/:id/retry`
- 适用状态：已完成或已失败任务
- 行为：创建一个新的子任务，并记录 `parentJobId / retryCount`

### Cancel

- 接口：`POST /api/job-logs/:id/cancel`
- 适用状态：`waiting / delayed / prioritized` 的待执行任务
- 不适用：已开始执行的任务

## 当前交付标准

当前版本已经适合：
- 本地演示
- 内部试运行
- 作为下一阶段迭代底座继续开发

当前版本还不适合：
- 多租户生产 SaaS
- 高并发公网生产
- 强审计 / 强权限 / 强监控的正式平台场景
