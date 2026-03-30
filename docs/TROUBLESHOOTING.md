# Troubleshooting

## 1. PostgreSQL 连不上怎么办

先检查：

```bash
pg_isready -h 127.0.0.1 -p 5432
```

再检查 `DATABASE_URL`：
- 是否库名正确
- 是否用户名正确
- 如果你用的是本机 Homebrew PostgreSQL，用户名可能不是 `postgres`

快速验证：

```bash
psql '<YOUR_DATABASE_URL>' -c 'SELECT 1;'
```

## 2. Redis 连不上怎么办

先检查：

```bash
redis-cli -h 127.0.0.1 -p 6379 ping
```

如果不是 `PONG`：
- 确认 Redis 服务是否已启动
- 确认 `REDIS_URL` 是否正确
- 如果用 Docker，确认容器和端口映射是否正常

## 3. migration 失败怎么办

先跑：

```bash
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate:deploy
```

优先检查：
- `apps/api/.env` 或当前 shell 的 `DATABASE_URL`
- 数据库是否真的可连
- `_prisma_migrations` 表里是否已有历史迁移

如果怀疑数据库状态不一致，可先查：

```bash
psql '<YOUR_DATABASE_URL>' -c 'SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY finished_at;'
```

## 4. Worker 不消费怎么办

先检查：
- Redis 是否可连
- Worker 是否真的启动
- 日志里是否有 `Queue workers started (4).`

推荐启动方式：

```bash
set -a
source .env
set +a
pnpm --filter api start:worker
```

如果任务一直停在 `PENDING`：
- 大概率是 Worker 没启动
- 或 Redis 连接失败

## 5. oMLX health check 失败怎么办

先检查：

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/v1/models -H "Authorization: Bearer <YOUR_OMLX_API_KEY>"
```

优先核对：
- `OMLX_BASE_URL` 是否是 `http://127.0.0.1:8000/v1`
- `OMLX_MODEL` 是否和 `/v1/models` 返回完全一致
- `OMLX_API_KEY` 是否正确

当前已验证通过的配置：

```bash
OMLX_BASE_URL=http://127.0.0.1:8000/v1
OMLX_MODEL=Qwen3.5-122B-A10B-MLX-9bit-finetuned
```

推荐 CLI 启动方式：

```bash
/Applications/oMLX.app/Contents/MacOS/omlx-cli serve \
  --base-path /Users/v188/.omlx \
  --port 8000 \
  --api-key <YOUR_OMLX_API_KEY>
```

## 6. `/jobs` 没看到任务怎么办

先查 API，而不是先怀疑前端：

```bash
curl 'http://localhost:3001/api/job-logs?page=1&pageSize=20'
```

如果 API 里有任务但页面没看到：
- 检查是否加了 `repositoryId / focusJobId / jobStatus` 过滤
- 刷新 `/jobs`
- 确认当前任务是不是被别的仓库上下文过滤掉了

如果 API 里也没有任务：
- 检查任务是否真的创建成功
- 检查对应动作是不是还在走同步接口

## 7. GitHub 回溯容易 rate limit 怎么办

优先检查：
- `.env` 或 `apps/api/.env` 里是否配置了 `GITHUB_TOKENS`
- 是否还停留在单 `GITHUB_TOKEN` 模式
- `GITHUB_SEARCH_MAX_CONCURRENCY` 是否过大
- `/api/settings/health` 里 GitHub 是否显示为多 token 模式

推荐配置：

```bash
GITHUB_TOKENS=token1,token2,token3,token4
GITHUB_SEARCH_MAX_CONCURRENCY=4
```

说明：
- 多 token 用逗号分隔即可，不需要改代码
- 从 4 个 token 扩到 10 个 token，也只需要继续往 `GITHUB_TOKENS` 里追加
- 单 token 只适合轻量测试，不适合 365 天回溯

如果已经命中 GitHub secondary rate limit / abuse detection：
- 先等待冷却结束
- 降低 Search 并发
- 缩小 `days`，先从 `7 -> 30 -> 365`
- 确认 deep analysis 只对 promising / toolLike 项目开启

安全提醒：
- 不要把 token 提交到仓库
- 不要把 token 贴到聊天工具
- 泄露后立即 rotate / revoke

## 8. Idea Fit / Completeness / Idea Extract 失败时先查哪里

优先检查顺序：

1. `/api/settings/health`
   - 看 `ai.omlx.ok`
2. `/api/job-logs/:id`
   - 看 `errorMessage`
   - 看 `result`
3. API / Worker 日志
4. `/v1/models`
   - 看模型名是否真实存在
5. `/api/repositories/:id`
   - 看 `analysisProvider / analysisModel / RepositoryAnalysis` 是否有写入

最常见原因：
- `OMLX_MODEL` 不存在或拼错
- `OMLX_BASE_URL` 没带 `/v1`
- `OMLX_API_KEY` 错误
- Worker 没启动
- oMLX 服务已启动，但模型没有被发现

## 9. Continuous Radar 长时间不推进怎么办

先查：

```bash
curl 'http://localhost:3001/api/github/radar/status'
```

重点看这些字段：
- `schedulerReason`
- `pendingWindow`
- `currentSearchWindow`
- `currentWindowTotalCount`
- `recentRetryCount`
- `recentRateLimitHits`
- `warnings`
- `/api/system/warnings`

经验判断：
- 如果 `schedulerReason=pending_backfill_resolving_search_windows`
  说明当前主要耗在 GitHub Search 切片，不是 AI 卡住
- 如果 `warnings` 里出现 token pool / timeout / queues idle
  就按告警方向排查
- 如果 `pendingWindow` 很久不变且 `runtimeUpdatedAt` 不推进
  优先检查 worker 是否仍在跑，或是否已经进入 stalled 恢复

## 10. 日志越来越大怎么办

当前系统已经带轻量日志轮转，不需要额外装 logrotate。

相关配置：

```bash
RADAR_MAINTENANCE_INTERVAL_MS=600000
LOG_ROTATE_MAX_BYTES=20971520
LOG_ROTATE_KEEP_FILES=14
```

日志目录：

```bash
~/Library/Logs/gitdian
```

当前策略：
- 单文件超过阈值会复制成带时间戳的归档文件，再原地截断
- 同一类日志只保留最近 `LOG_ROTATE_KEEP_FILES` 份

## 11. 历史运行数据怎么清理

这是轻量 retention，不会删除核心 insight / manual override / daily summary。

相关配置：

```bash
FAILED_JOBLOG_RETENTION_DAYS=14
SUCCESS_JOBLOG_RETENTION_DAYS=45
ANALYSIS_RAW_RESPONSE_RETENTION_DAYS=14
```

当前会清理：
- 过旧的失败 JobLog
- 过旧的低价值成功 JobLog（如 backfill / snapshot / deep 的运行记录）
- 过旧的 `RepositoryAnalysis.rawResponse`

## 12. 怎么做最小备份与恢复

备份：

```bash
/Users/v188/Documents/gitdian/scripts/backup.sh
```

会导出：
- `SystemConfig`
- `Repository`
- `RepositoryAnalysis`
- `DailyRadarSummary`

恢复前建议：
- 先恢复到临时数据库验证
- 再决定是否覆盖当前库

直接覆盖恢复：

```bash
/Users/v188/Documents/gitdian/scripts/ops/restore-core.sh /path/to/backup-dir --force
```

注意：
- `restore-core.sh` 会先清空目标表，再导入备份
- 不带 `--force` 不会执行
- 完整恢复步骤见：[RESTORE.md](/Users/v188/Documents/gitdian/docs/RESTORE.md)
