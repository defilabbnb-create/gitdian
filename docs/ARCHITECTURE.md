# Architecture

## 高层架构图

```text
                         +----------------------+
                         |      Next.js Web     |
                         | Home / Detail / Jobs |
                         +----------+-----------+
                                    |
                                    v
                         +----------------------+
                         |     NestJS API       |
                         | Repository / Jobs    |
                         | Analysis / Settings  |
                         +----+-----------+-----+
                              |           |
                  sync reads  |           | async enqueue
                              v           v
                    +----------------+  +----------------+
                    |   PostgreSQL   |  | Redis + BullMQ |
                    | Prisma Models  |  | Queue Storage  |
                    +--------+-------+  +--------+-------+
                             ^                   |
                             | result writeback  | consume
                             |                   v
                      +------+---------------------------+
                      |            Worker               |
                      | fetch / fast-filter / analysis  |
                      +------+---------------------------+
                             |
                             v
                      +----------------------+
                      |   Local oMLX API     |
                      | OpenAI-compatible    |
                      +----------------------+
```

## 模块说明

### Repository

- 负责 GitHub 仓库采集、保存仓库基础信息、README、目录摘要、commits、issues
- 既服务首页候选仓库列表，也为详情页和分析模块提供输入数据

### Analysis

- 负责编排 `Fast Filter / Completeness / Idea Fit / Idea Extract`
- 支持单仓库和批量模式
- 分析结果最终回写到 `Repository` 与 `RepositoryAnalysis`

### Queue

- 基于 `BullMQ + Redis`
- 把 GitHub 采集、批量任务、单仓库分析从同步请求中拆出来
- 让前端不必等待长耗时 AI 分析完成

### JobLog

- 负责记录任务状态、错误信息、结果摘要、重试关系
- 对应 `/api/job-logs` 和 `/jobs`
- 是演示、调试、排障和后续观测的核心审计入口

### AI

- 当前默认走本地 `oMLX`
- 通过 OpenAI-compatible API 调用模型
- Claude 不是主分析模型，而是“判断质量总控层”
- 当前已验证配置：
  - `OMLX_BASE_URL=http://127.0.0.1:8000/v1`
  - `OMLX_MODEL=Qwen3.5-122B-A10B-MLX-9bit-finetuned`

### Claude 质量总控层

- 当前已经在做：
  - 单仓库 high-precision review
  - top candidates / Daily Summary / Telegram top items 修正
  - fallback replay
  - review diff 沉淀，记录本地 insight、Claude review 与最终决策差异
  - training hints 输出，指导本地模型后续优化
- 当前应该做但不进入主跑量链路：
  - 历史分析结果巡检
  - 系统性偏差归因
  - 本地模型 heuristics / prompt / anchors 改进建议
- 不该让 Claude 做：
  - snapshot 主流程
  - deep 主流程
  - GitHub 抓取与大规模跑量

这层的定位是：
- OMLX 负责吞吐和主链路
- Claude 负责高价值复核、系统偏差诊断、review diff 沉淀和 training hints 汇总
- fallback 期间仍由本地模型顶住主流程，Claude 恢复后再回补高价值结果

## 数据流说明

### 同步流

适合轻量读取类场景：
- 首页读取仓库列表
- 详情页读取仓库与分析结果
- `/jobs` 读取 JobLog 列表和详情
- `/settings` 读取系统健康状态

同步流特点：
- 请求返回快
- 不执行长耗时计算
- 直接从数据库读取结果

### 异步流

适合长耗时、批量、外部依赖型场景：
- GitHub 异步采集
- 单仓库异步分析
- 批量异步分析
- 批量 Fast Filter

异步流步骤：
1. 前端或 API 发起任务请求
2. API 创建 JobLog 并写入队列
3. Worker 从 Redis 消费任务
4. Worker 调用 GitHub / 本地 oMLX / 分析模块
5. 结果回写 PostgreSQL
6. JobLog 更新为 `SUCCESS` 或 `FAILED`
7. 前端通过 `/jobs`、首页摘要、详情页关联任务查看结果

## 为什么用 BullMQ + 本地 AI

### 为什么用 BullMQ

- GitHub 采集和 AI 分析都有明显的长耗时特征
- 单次请求里同步执行，不利于前端演示，也不利于失败重试
- BullMQ 提供了稳定的入队、消费、重试和状态建模能力，适合把“分析流程”从页面请求里拆出来

### 为什么用本地 AI

- 这个项目的目标之一就是“本地可演示、可交接、可继续迭代”
- 本地 oMLX 可以减少外部云依赖，让演示时环境更可控
- 通过 OpenAI-compatible API 抽象，后续仍可切换或补充其它 provider

## 架构取舍

当前架构优先的是：
- 本地可运行
- 演示稳定
- 任务链路透明
- 后续可继续扩展

当前没有优先解决的，是：
- 多租户隔离
- websocket 实时推送
- 复杂队列监控大盘
- 高并发公网部署治理
