# GitDian Analysis State Repair Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Separate “current-stage judgement” from “analysis completion”, stop exposing half-finished analysis as trusted output, and prioritize high-value incomplete repositories for light/full deep recovery.

**Architecture:** Keep the existing pipeline and storage model, but add a derived analysis-status layer, a derived display-status layer, a conservative light-analysis fallback, and a scheduler/recovery bridge that reorders queue pressure around homepage exposure and high-value incomplete repos. Avoid schema churn by deriving statuses at the API layer and persisting only scheduler/health runtime state in `SystemConfig`.

**Tech Stack:** NestJS, Prisma, BullMQ, Next.js, shared workspace utilities, SystemConfig-backed runtime state.

---

### Task 1: Define Shared Status Vocabulary

**Files:**
- Modify: `apps/web/src/lib/types/repository.ts`
- Create: `apps/api/src/modules/analysis/helpers/repository-analysis-status.helper.ts`
- Test: `apps/api/test/repository-analysis-status.helper.test.js`

**Step 1: Add status enums**
- Add `RepositoryDerivedAnalysisStatus`:
  - `NOT_READY`
  - `SNAPSHOT_ONLY`
  - `INSIGHT_READY`
  - `DISPLAY_READY`
  - `DEEP_PENDING`
  - `DEEP_DONE`
  - `REVIEW_PENDING`
  - `REVIEW_DONE`
  - `SKIPPED_BY_GATE`
  - `FAILED`
- Add `RepositoryDisplayStatus`:
  - `HIDDEN`
  - `BASIC_READY`
  - `TRUSTED_READY`
  - `HIGH_CONFIDENCE_READY`
  - `UNSAFE`

**Step 2: Write helper tests**
- Verify derivation for:
  - snapshot only
  - insight ready without deep
  - deep pending
  - deep done
  - review done
  - fallback unsafe
  - severe conflict unsafe

**Step 3: Implement minimal status helper**
- Input:
  - repository
  - analysis
  - finalDecision
  - queue/job hints
- Output:
  - `analysisStatus`
  - `displayStatus`
  - booleans:
    - `displayReady`
    - `trustedDisplayReady`
    - `deepReady`
    - `reviewReady`
    - `fullyAnalyzed`
    - `fallbackVisible`
    - `unsafe`
  - `incompleteReason`

### Task 2: Re-define finalDecision as Stage Judgement

**Files:**
- Modify: `apps/api/src/modules/analysis/repository-decision.service.ts`
- Modify: `apps/api/src/modules/analysis/helpers/repository-final-decision.helper.ts`
- Modify: `apps/api/src/modules/repository/repository.service.ts`
- Test: `apps/api/test/final-decision.helper.test.js`

**Step 1: Preserve finalDecision but change semantics**
- Keep `finalDecision` as “current-stage conservative judgement”.
- Add explicit fields:
  - `analysisStatus`
  - `displayStatus`
  - `displayReady`
  - `trustedDisplayReady`
  - `deepReady`
  - `reviewReady`
  - `fullyAnalyzed`

**Step 2: Stop using finalDecision as completion signal**
- In API serialization, attach derived status block next to `finalDecision`.
- In tests, verify:
  - `finalDecision` can exist with `analysisStatus=DISPLAY_READY`
  - `fullyAnalyzed=false` until deep trio exists

### Task 3: Add Conservative Light Analysis Fallback

**Files:**
- Modify: `apps/api/src/modules/analysis/repository-decision.service.ts`
- Modify: `apps/web/src/lib/repository-decision.ts`
- Modify: `apps/web/src/components/repositories/repository-detail-conclusion.tsx`
- Modify: `apps/web/src/components/repositories/repository-list-item.tsx`
- Test: `apps/api/test/repository-analysis-status.helper.test.js`

**Step 1: Define light analysis payload**
- Add derived fields:
  - `targetUsers`
  - `monetization`
  - `whyItMatters`
  - `nextStep`
  - `caution`
- Source priority:
  - snapshot reason
  - insight verdict reason
  - README/content summary
  - money priority signals

**Step 2: Use fallback when no deep**
- If no deep trio:
  - show conservative light analysis
  - hide strong monetization / strong why / strong build directives
- Ensure detail page never shows large `--` blocks.

### Task 4: Frontend Stop-Bleed

**Files:**
- Modify: `apps/web/src/lib/repository-data-guard.ts`
- Modify: `apps/web/src/components/repositories/home-featured-repositories.tsx`
- Modify: `apps/web/src/components/repositories/repository-list.tsx`
- Modify: `apps/web/src/components/repositories/repository-list-item.tsx`
- Modify: `apps/web/src/components/repositories/repository-detail-header.tsx`
- Modify: `apps/web/src/components/repositories/repository-detail-conclusion.tsx`
- Modify: `apps/web/src/app/page.tsx`

**Step 1: Make homepage/list/detail trust status layer**
- Homepage featured requires:
  - `trustedDisplayReady`
  - `unsafe=false`
  - `fallbackVisible=false`
- Incomplete / fallback / severe conflict:
  - degrade card
  - suppress strong monetization and strong why

**Step 2: Add explicit incomplete reason copy**
- Display reason labels:
  - `NO_DEEP_ANALYSIS`
  - `QUEUED_NOT_FINISHED`
  - `SKIPPED_BY_GATE`
  - `FAILED_DURING_ANALYSIS`

### Task 5: Deep Split and Queue Re-Prioritization

**Files:**
- Modify: `apps/api/src/modules/analysis/analysis-orchestrator.service.ts`
- Modify: `apps/api/src/modules/analysis/historical-data-recovery.service.ts`
- Modify: `apps/api/src/modules/analysis/helpers/historical-data-recovery.helper.ts`
- Modify: `apps/api/src/modules/queue/queue.service.ts`
- Modify: `apps/api/src/modules/analysis/dto/run-analysis.dto.ts`
- Create: `apps/api/src/modules/scheduler/adaptive-scheduler.types.ts`
- Create: `apps/api/src/modules/scheduler/adaptive-scheduler.rules.ts`
- Create: `apps/api/src/modules/scheduler/adaptive-scheduler.explainer.ts`
- Create: `apps/api/src/modules/scheduler/adaptive-scheduler.service.ts`
- Create: `apps/api/src/modules/scheduler/adaptive-scheduler.module.ts`
- Test: `apps/api/test/adaptive-scheduler.rules.test.js`
- Test: `apps/api/test/adaptive-scheduler.service.test.js`

**Step 1: Distinguish light deep vs full deep**
- `light deep`:
  - why
  - user confidence
  - monetization confidence
  - next step
- `full deep`:
  - idea_fit
  - idea_extract
  - completeness

**Step 2: Scheduler modes**
- `NORMAL`
- `HOMEPAGE_PROTECT`
- `DEEP_RECOVERY`
- `FALLBACK_CLEANUP`
- `CLAUDE_CATCHUP`
- `CRITICAL_BACKPRESSURE`

**Step 3: Queue integration**
- Queue service reads scheduler state and applies:
  - priority boosts
  - suppression
  - concurrency targets metadata

### Task 6: Daily Health + Regression System

**Files:**
- Create: `apps/api/src/scripts/health/daily-health-check.ts`
- Create: `apps/api/src/scripts/health/health-metrics.collector.ts`
- Create: `apps/api/src/scripts/health/health-evaluator.ts`
- Create: `apps/api/src/scripts/health/health-diff.ts`
- Create: `apps/api/src/scripts/health/health-reporter.ts`
- Create: `apps/api/src/scripts/health/health-thresholds.ts`
- Create: `apps/api/test/health-check.test.js`
- Create: `.github/workflows/daily-health-check.yml`
- Modify: `apps/api/package.json`

**Step 1: Reuse audit helper metrics**
- Collect repo/task/queue/homepage/one-liner/behavior metrics.

**Step 2: Persist latest health state**
- Write JSON + Markdown report
- Write latest snapshot to `SystemConfig`

**Step 3: Optional repair hook**
- If `--auto-repair`, trigger:
  - homepage light recovery
  - high-value deep recovery
  - conflict Claude catch-up

### Task 7: Validation, Rollout, and Git

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/web/package.json` if needed

**Step 1: Run verification**
- `pnpm --filter api typecheck`
- `pnpm --filter api lint`
- `pnpm --filter api test`
- `pnpm --filter api build`
- `pnpm --filter web typecheck`
- `pnpm --filter web lint`
- `pnpm --filter web build`

**Step 2: Run audit/health smoke tests**
- Run task analysis completion report
- Run daily health check dry-run
- Run adaptive scheduler dry-run

**Step 3: Commit and push**
- Commit core fix
- Commit scheduler/health
- Push current branch
