# Restore Guide

这份文档说明 gitdian 的最小本地恢复流程，不涉及新的调度系统或外部备份平台。

## 覆盖范围

当前备份/恢复脚本覆盖这些核心数据：

- `SystemConfig`
- `Repository`
- `RepositoryAnalysis`
- `DailyRadarSummary`

相关入口：

- 备份入口：[backup.sh](/Users/v188/Documents/gitdian/scripts/backup.sh)
- 核心备份脚本：[backup-core.sh](/Users/v188/Documents/gitdian/scripts/ops/backup-core.sh)
- 恢复脚本：[restore-core.sh](/Users/v188/Documents/gitdian/scripts/ops/restore-core.sh)

## 先做一次当前备份

```bash
/Users/v188/Documents/gitdian/scripts/backup.sh
```

产物默认会写到：

```text
/Users/v188/Documents/gitdian/backups/gitdian-core/<timestamp>/
```

目录中至少会有：

- `schema.sql`
- `core-data.sql`
- `manifest.txt`

## 恢复步骤

1. 确认要恢复的备份目录。
2. 确认当前 `DATABASE_URL` 指向目标数据库。
3. 显式执行恢复：

```bash
/Users/v188/Documents/gitdian/scripts/ops/restore-core.sh /path/to/backup-dir --force
```

注意：

- `restore-core.sh` 会先清空目标核心表，再导入备份。
- 建议先恢复到临时数据库验证，再决定是否覆盖当前主库。

## 恢复后校验

建议至少执行：

```bash
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate:deploy
pnpm --filter api build
pnpm --filter api lint
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web build
```

并检查：

- [API health](http://localhost:3001/api/health)
- [Radar status](http://localhost:3001/api/github/radar/status)
- [Latest daily summary](http://localhost:3001/api/github/radar/daily-summary/latest)
- [System warnings](http://localhost:3001/api/system/warnings)

## 如何重新启动 radar

先看当前状态：

```bash
curl -s http://localhost:3001/api/github/radar/status | jq
```

常用控制接口：

- 启动：`POST /api/github/radar/start`
- 暂停：`POST /api/github/radar/pause`
- 恢复：`POST /api/github/radar/resume`

例如：

```bash
curl -s -X POST http://localhost:3001/api/github/radar/resume | jq
```

如果当前已经是 `isRunning=true`，通常不需要重复触发。
