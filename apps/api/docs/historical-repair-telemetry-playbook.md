# Historical Repair Telemetry Playbook

这份 playbook 只覆盖 `historical_repair` 新增的 telemetry 日志，目标是让你上线后能快速回答 4 件事：

1. 吞吐到底涨了多少
2. 全局 gate 是在保护系统，还是在卡吞吐
3. bulk fallback 是偶发还是常态
4. deep repair lookup 还是不是主要长尾

## 0. 先准备日志文件

默认下面的命令都假设你已经有一个可 grep 的日志文件：

```bash
export LOG=/path/to/api.log
```

如果你要从 `journalctl` 临时导一份：

```bash
journalctl -u gitdian-api -S today > /tmp/gitdian-api.log
export LOG=/tmp/gitdian-api.log
```

如果机器上没有 `rg`，把下面的 `rg` 换成 `grep -E` 也可以。

也可以直接用离线聚合 CLI：

```bash
pnpm --filter api telemetry:historical-repair-summary -- --file "$LOG"
```

或：

```bash
rg 'historical_repair' "$LOG" | pnpm --filter api telemetry:historical-repair-summary
```

## 1. 快速只看历史修复 telemetry

```bash
rg 'historical_repair (gate_config|loop_telemetry|lane_summary|lane_telemetry)' "$LOG"
```

如果只想看最近 50 条：

```bash
rg 'historical_repair (gate_config|loop_telemetry|lane_summary|lane_telemetry)' "$LOG" | tail -n 50
```

## 2. 看 loop 级吞吐

看最近 20 轮：

```bash
rg 'historical_repair loop_telemetry' "$LOG" | tail -n 20
```

聚合 `selectedCount`、`loopQueuedCount`、`totalDurationMs`、`loopQueuedPerSecond`，并单独看 backlog snapshot：

```bash
rg 'historical_repair loop_telemetry' "$LOG" | awk '
{
  selected = 0;
  queued = 0;
  duration = 0;
  qps = 0;
  pending = 0;
  running = 0;

  for (i = 1; i <= NF; i += 1) {
    if ($i ~ /^selectedCount=/) {
      split($i, a, "=");
      selected = a[2] + 0;
    }
    if ($i ~ /^loopQueuedCount=/ || $i ~ /^totalQueuedCount=/) {
      split($i, a, "=");
      queued = a[2] + 0;
    }
    if ($i ~ /^totalDurationMs=/) {
      split($i, a, "=");
      duration = a[2] + 0;
    }
    if ($i ~ /^loopQueuedPerSecond=/ || $i ~ /^queuedPerSecond=/) {
      split($i, a, "=");
      qps = a[2] + 0;
    }
    if ($i ~ /^globalPendingCount=/) {
      split($i, a, "=");
      pending = a[2] + 0;
    }
    if ($i ~ /^globalRunningCount=/) {
      split($i, a, "=");
      running = a[2] + 0;
    }
  }

  loops += 1;
  selectedSum += selected;
  queuedSum += queued;
  durationSum += duration;
  qpsSum += qps;
  pendingSum += pending;
  runningSum += running;
  if (qps > qpsMax) {
    qpsMax = qps;
  }
  if (duration > durationMax) {
    durationMax = duration;
  }
}
END {
  printf(
    "loops=%d avgSelected=%.2f avgLoopQueued=%.2f avgDurationMs=%.2f maxDurationMs=%.0f avgLoopQueuedPerSecond=%.2f maxLoopQueuedPerSecond=%.2f avgGlobalPending=%.2f avgGlobalRunning=%.2f\n",
    loops,
    loops ? selectedSum / loops : 0,
    loops ? queuedSum / loops : 0,
    loops ? durationSum / loops : 0,
    durationMax,
    loops ? qpsSum / loops : 0,
    qpsMax,
    loops ? pendingSum / loops : 0,
    loops ? runningSum / loops : 0
  );
}'
```

找最慢的 20 轮：

```bash
rg 'historical_repair loop_telemetry' "$LOG" | awk '
{
  duration = 0;
  selected = 0;
  queued = 0;
  qps = 0;

  for (i = 1; i <= NF; i += 1) {
    if ($i ~ /^totalDurationMs=/) {
      split($i, a, "=");
      duration = a[2] + 0;
    }
    if ($i ~ /^selectedCount=/) {
      split($i, a, "=");
      selected = a[2] + 0;
    }
    if ($i ~ /^loopQueuedCount=/ || $i ~ /^totalQueuedCount=/) {
      split($i, a, "=");
      queued = a[2] + 0;
    }
    if ($i ~ /^loopQueuedPerSecond=/ || $i ~ /^queuedPerSecond=/) {
      split($i, a, "=");
      qps = a[2] + 0;
    }
  }

  printf "%012d selected=%d loopQueued=%d loopQueuedPerSecond=%.2f %s\n", duration, selected, queued, qps, $0;
}' | sort -r | head -n 20
```

## 3. 看全局 gate 是否在排队

先看最近 50 条 lane 级 gate wait：

```bash
rg 'historical_repair lane_telemetry' "$LOG" | tail -n 50
```

按 lane 聚合 `gateWaitMs`：

```bash
rg 'historical_repair lane_telemetry' "$LOG" | awk '
{
  lane = "";
  wait = 0;
  acquires = 0;
  gate = 0;

  for (i = 1; i <= NF; i += 1) {
    if ($i ~ /^lane=/) {
      split($i, a, "=");
      lane = a[2];
    }
    if ($i ~ /^gateWaitMs=/) {
      split($i, a, "=");
      wait = a[2] + 0;
    }
    if ($i ~ /^gateAcquireCount=/) {
      split($i, a, "=");
      acquires = a[2] + 0;
    }
    if ($i ~ /^historicalRepairGlobalConcurrency=/) {
      split($i, a, "=");
      gate = a[2] + 0;
    }
  }

  count[lane] += 1;
  waitSum[lane] += wait;
  acquireSum[lane] += acquires;
  if (wait > waitMax[lane]) {
    waitMax[lane] = wait;
  }
  gateLast[lane] = gate;
}
END {
  for (lane in count) {
    printf(
      "%s samples=%d gate=%d avgGateWaitMs=%.2f maxGateWaitMs=%.0f avgGateAcquireCount=%.2f\n",
      lane,
      count[lane],
      gateLast[lane],
      count[lane] ? waitSum[lane] / count[lane] : 0,
      waitMax[lane],
      count[lane] ? acquireSum[lane] / count[lane] : 0
    );
  }
}'
```

只盯 `gateWaitMs > 200` 的长等待：

```bash
rg 'historical_repair lane_telemetry' "$LOG" | awk '
{
  wait = 0;
  for (i = 1; i <= NF; i += 1) {
    if ($i ~ /^gateWaitMs=/) {
      split($i, a, "=");
      wait = a[2] + 0;
    }
  }
  if (wait > 200) {
    print;
  }
}'
```

## 4. 看 bulk 子批次质量

看最近的 snapshot lane telemetry：

```bash
rg 'historical_repair lane_telemetry lane=(refresh_only|evidence_repair)' "$LOG" | tail -n 50
```

按 lane 聚合 `bulkBatches` / `bulkFallbackBatches`：

```bash
rg 'historical_repair lane_telemetry lane=(refresh_only|evidence_repair)' "$LOG" | awk '
{
  lane = "";
  bulk = 0;
  fallback = 0;

  for (i = 1; i <= NF; i += 1) {
    if ($i ~ /^lane=/) {
      split($i, a, "=");
      lane = a[2];
    }
    if ($i ~ /^bulkBatches=/) {
      split($i, a, "=");
      bulk = a[2] + 0;
    }
    if ($i ~ /^bulkFallbackBatches=/) {
      split($i, a, "=");
      fallback = a[2] + 0;
    }
  }

  bulkSum[lane] += bulk;
  fallbackSum[lane] += fallback;
}
END {
  for (lane in bulkSum) {
    printf(
      "%s bulkBatches=%d bulkFallbackBatches=%d fallbackRatio=%.4f\n",
      lane,
      bulkSum[lane],
      fallbackSum[lane],
      bulkSum[lane] ? fallbackSum[lane] / bulkSum[lane] : 0
    );
  }
}'
```

如果你想直接数 fallback 告警：

```bash
rg 'historical_repair bulk snapshot lane failed' "$LOG" | wc -l
```

## 5. 看 deep repair lookup 长尾

只看 `deep_repair` 的 lookup telemetry：

```bash
rg 'historical_repair lane_telemetry lane=deep_repair' "$LOG"
```

聚合 chunk 数和 lookup 时长：

```bash
rg 'historical_repair lane_telemetry lane=deep_repair' "$LOG" | awk '
{
  chunkSize = 0;
  chunkCount = 0;
  lookupMs = 0;
  gateWait = 0;

  for (i = 1; i <= NF; i += 1) {
    if ($i ~ /^deepRepairLookupChunkSize=/) {
      split($i, a, "=");
      chunkSize = a[2] + 0;
    }
    if ($i ~ /^deepRepairLookupChunkCount=/) {
      split($i, a, "=");
      chunkCount = a[2] + 0;
    }
    if ($i ~ /^deepRepairLookupDurationMs=/) {
      split($i, a, "=");
      lookupMs = a[2] + 0;
    }
    if ($i ~ /^gateWaitMs=/) {
      split($i, a, "=");
      gateWait = a[2] + 0;
    }
  }

  samples += 1;
  chunkSizeLast = chunkSize;
  chunkCountSum += chunkCount;
  lookupSum += lookupMs;
  gateWaitSum += gateWait;
  if (lookupMs > lookupMax) {
    lookupMax = lookupMs;
  }
}
END {
  printf(
    "samples=%d chunkSize=%d avgChunkCount=%.2f avgLookupMs=%.2f maxLookupMs=%.0f avgGateWaitMs=%.2f\n",
    samples,
    chunkSizeLast,
    samples ? chunkCountSum / samples : 0,
    samples ? lookupSum / samples : 0,
    lookupMax,
    samples ? gateWaitSum / samples : 0
  );
}'
```

找 deep lookup 最慢的 20 条：

```bash
rg 'historical_repair lane_telemetry lane=deep_repair' "$LOG" | awk '
{
  lookupMs = 0;
  for (i = 1; i <= NF; i += 1) {
    if ($i ~ /^deepRepairLookupDurationMs=/) {
      split($i, a, "=");
      lookupMs = a[2] + 0;
    }
  }
  printf "%012d %s\n", lookupMs, $0;
}' | sort -r | head -n 20
```

## 6. 看 gate 配置有没有漂移

看最近几次启动或变更后的全局 gate：

```bash
rg 'historical_repair gate_config' "$LOG" | tail -n 20
```

看是否混入了不一致配置：

```bash
rg 'historical_repair gate_config' "$LOG" | awk '
{
  for (i = 1; i <= NF; i += 1) {
    if ($i ~ /^historicalRepairGlobalConcurrency=/) {
      split($i, a, "=");
      gate[a[2]] += 1;
    }
  }
}
END {
  for (value in gate) {
    printf "historicalRepairGlobalConcurrency=%s count=%d\n", value, gate[value];
  }
}'
```

## 7. 最常用的组合查询

如果你想一起看 loop 吞吐和 lane 排队：

```bash
rg 'historical_repair (loop_telemetry|lane_telemetry)' "$LOG" | tail -n 80
```

如果你只想看“慢 + fallback”的证据：

```bash
rg 'historical_repair (loop_telemetry|lane_telemetry|bulk snapshot lane failed)' "$LOG" | tail -n 120
```

如果你只想看 deep repair：

```bash
rg 'historical_repair (lane_summary lane=deep_repair|lane_telemetry lane=deep_repair)' "$LOG"
```

## 8. 异常信号到动作的速查

看到这些信号时，优先动作如下：

| 信号 | 更像什么问题 | 第一动作 |
|---|---|---|
| `gateWaitMs` 普遍偏高，但 DB/Redis 平稳 | gate 偏保守 | `HISTORICAL_REPAIR_GLOBAL_CONCURRENCY` 小步上调 |
| `bulkFallbackBatches` 比例偏高 | 单批 bulk 偏重 | 先把 snapshot `batchSize` 往下调 |
| `deepRepairLookupDurationMs` 长尾明显 | deep lookup 偏重 | 先把 `chunkSize` 往下调 |
| DB/Redis/worker 明显尖峰 | 总压强过高 | 先把全局 gate 往下调 |
| `loopQueuedPerSecond` 没起色，但 `gateWaitMs` 不高 | 可能不是 gate，而是下游或查库 | 看 bulk fallback、deep lookup 和 queue enqueue 成本 |

## 9. 建议的固定观测节奏

每次调参都用同一套顺序：

1. 先看最近 20 条 `loop_telemetry`
2. 再看 `lane_telemetry` 里的 `gateWaitMs`
3. 再看 snapshot lane 的 `bulkFallbackBatches`
4. 最后单独看 `deep_repair` 的 `deepRepairLookupDurationMs`

不要一次改两个旋钮，不然你没法知道到底是谁起作用。
