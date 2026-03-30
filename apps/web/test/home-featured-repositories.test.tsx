import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  HomeNewOpportunitiesStrip,
  selectHomepageDecisionTerminal,
} from '../src/components/repositories/home-featured-repositories';
import { getBehaviorMemoryProfile } from '../src/lib/behavior-memory';
import type { RepositoryListItem } from '../src/lib/types/repository';
import { createRepositoryFixture } from './helpers/repository-fixture';

function createHomepageRepository(
  index: number,
  overrides: Partial<RepositoryListItem> = {},
) {
  const base = createRepositoryFixture({
    id: `repo-${index}`,
    name: `repo-${index}`,
    fullName: `acme/repo-${index}`,
    htmlUrl: `https://github.com/acme/repo-${index}`,
    stars: 300 - index,
    createdAtGithub: `2026-03-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    ...(overrides as Record<string, unknown>),
  });

  return base as unknown as RepositoryListItem;
}

function createStrongProvisionalRepository(index: number) {
  return createHomepageRepository(
    index,
    {
      analysis: {
        deepAnalysisStatus: 'NOT_STARTED',
        ideaFitJson: null,
        extractedIdeaJson: null,
        completenessJson: null,
      },
      analysisState: {
        analysisStatus: 'DEEP_PENDING',
        displayStatus: 'BASIC_READY',
        trustedDisplayReady: false,
        highConfidenceReady: false,
        lightDeepReady: false,
        fullDeepReady: false,
        deepReady: false,
        reviewEligible: false,
        reviewReady: false,
        fullyAnalyzed: false,
        incompleteReason: 'NO_DEEP_ANALYSIS',
        incompleteReasons: ['NO_DEEP_ANALYSIS'],
        fallbackVisible: false,
        unsafe: false,
      },
    } as unknown as Partial<RepositoryListItem>,
  );
}

function createMediumProvisionalRepository(index: number) {
  return createHomepageRepository(index, {
    finalDecision: {
      oneLinerStrength: 'MEDIUM',
      moneyPriority: 'P0',
      moneyPriorityLabelZh: 'P0 · 能赚钱',
      action: 'CLONE',
      decisionSummary: {
        headlineZh: '一个帮小团队跑固定提醒和同步流程的工具',
        finalDecisionLabelZh: '值得做 · 快速验证',
        moneyPriorityLabelZh: 'P0 · 能赚钱',
        reasonZh: '用户和付费路径比较明确，但还缺最后一轮深分析。',
        targetUsersZh: '小团队和运营人员',
        monetizationSummaryZh: '适合先用轻量订阅验证付费意愿。',
      },
      moneyDecision: {
        score: 88,
        targetUsersZh: '小团队和运营人员',
        monetizationSummaryZh: '适合先用轻量订阅验证付费意愿。',
      },
    },
    analysis: {
      deepAnalysisStatus: 'NOT_STARTED',
      ideaFitJson: null,
      extractedIdeaJson: null,
      completenessJson: null,
      moneyPriority: {
        score: 88,
        moneyScore: 88,
        reasonZh: '用户和付费路径比较明确，但还缺最后一轮深分析。',
        targetUsersZh: '小团队和运营人员',
        monetizationSummaryZh: '适合先用轻量订阅验证付费意愿。',
      },
    },
    analysisState: {
      analysisStatus: 'DISPLAY_READY',
      displayStatus: 'BASIC_READY',
      trustedDisplayReady: false,
      highConfidenceReady: false,
      lightDeepReady: true,
      fullDeepReady: false,
      deepReady: false,
      reviewEligible: false,
      reviewReady: false,
      fullyAnalyzed: false,
      incompleteReason: 'NO_DEEP_ANALYSIS',
      incompleteReasons: ['NO_DEEP_ANALYSIS'],
      fallbackVisible: false,
      unsafe: false,
    },
  } as unknown as Partial<RepositoryListItem>);
}

function createTrustedButIneligibleRepository(index: number) {
  return createHomepageRepository(index, {
    finalDecision: {
      oneLinerStrength: 'MEDIUM',
      moneyPriority: 'P2',
      moneyPriorityLabelZh: 'P2 · 值得借鉴',
      action: 'CLONE',
      decisionSummary: {
        headlineZh: '一个帮团队提升效率的工具',
        finalDecisionLabelZh: '可继续看 · 快速验证',
        reasonZh: '方向可以参考，但不够适合直接推进到首页第一优先。',
        targetUsersZh: '开发者和小团队',
        monetizationSummaryZh: '收费路径暂时不够清楚，先用访谈确认真实需求。',
      },
      moneyDecision: {
        score: 71,
        targetUsersZh: '开发者和小团队',
        monetizationSummaryZh: '收费路径暂时不够清楚，先用访谈确认真实需求。',
      },
    },
    analysis: {
      moneyPriority: {
        score: 71,
        moneyScore: 71,
        tier: 'WORTH_CLONING',
        moneyDecision: 'CLONEABLE',
        reasonZh: '方向可以参考，但不够适合直接推进到首页第一优先。',
        targetUsersZh: '开发者和小团队',
        monetizationSummaryZh: '收费路径暂时不够清楚，先用访谈确认真实需求。',
      },
    },
  } as unknown as Partial<RepositoryListItem>);
}

function createRecoveryRepository(index: number) {
  return createHomepageRepository(index, {
    finalDecision: {
      oneLinerStrength: 'MEDIUM',
      moneyPriority: 'P2',
      moneyPriorityLabelZh: 'P2 · 值得借鉴',
      action: 'BUILD',
      decisionSummary: {
        headlineZh: '一个帮团队管理密钥与环境变量的工具',
        finalDecisionLabelZh: '值得继续看 · 先补证据',
        moneyPriorityLabelZh: 'P2 · 值得借鉴',
        reasonZh: '用户、场景和收费路径都比较明确，但当前 headline 强度还不够进 trusted 首屏。',
        targetUsersZh: '开发团队和平台工程团队',
        monetizationSummaryZh: '适合按团队订阅和托管版验证付费。',
      },
      moneyDecision: {
        score: 91,
        targetUsersZh: '开发团队和平台工程团队',
        monetizationSummaryZh: '适合按团队订阅和托管版验证付费。',
      },
    },
    analysis: {
      insightJson: {
        oneLinerZh: '一个帮团队管理密钥与环境变量的工具',
        verdict: 'GOOD',
        verdictReason: '用户、场景和收费路径都比较明确，但当前 headline 强度还不够进 trusted 首屏。',
        action: 'BUILD',
        completenessScore: 84,
        completenessLevel: 'HIGH',
        category: {
          main: 'tools',
          sub: 'devtools',
        },
        projectReality: {
          type: 'tool',
          hasRealUser: true,
          hasClearUseCase: true,
          isDirectlyMonetizable: true,
        },
        summaryTags: ['密钥管理', '平台工程'],
        oneLinerStrength: 'MEDIUM',
      },
      moneyPriority: {
        score: 91,
        moneyScore: 91,
        reasonZh: '用户、场景和收费路径都比较明确，但当前 headline 强度还不够进 trusted 首屏。',
        targetUsersZh: '开发团队和平台工程团队',
        monetizationSummaryZh: '适合按团队订阅和托管版验证付费。',
        signals: {
          hasRealUser: true,
          hasClearUseCase: true,
          isDirectlyMonetizable: true,
          looksInfraLayer: false,
        },
      },
    },
  } as unknown as Partial<RepositoryListItem>);
}

test('falls back to strong provisional homepage candidates when the trusted pool is empty', () => {
  const items = Array.from({ length: 5 }, (_, index) =>
    createStrongProvisionalRepository(index + 1),
  );

  const selection = selectHomepageDecisionTerminal(
    items,
    new Map(),
    getBehaviorMemoryProfile(),
  );

  assert.equal(selection.selectionMode, 'provisional');
  assert.ok(selection.top1);
  assert.equal(selection.top1?.decisionView.displayState, 'provisional');
  assert.equal(selection.top3.length, 3);
  assert.equal(selection.newOpportunities.length, 1);
});

test('keeps trusted homepage candidates ahead of provisional fallback candidates', () => {
  const trusted = createHomepageRepository(1, {
    stars: 999,
  });
  const provisional = Array.from({ length: 5 }, (_, index) =>
    createStrongProvisionalRepository(index + 2),
  );

  const selection = selectHomepageDecisionTerminal(
    [trusted, ...provisional],
    new Map(),
    getBehaviorMemoryProfile(),
  );

  assert.equal(selection.selectionMode, 'trusted');
  assert.equal(selection.top1?.repository.id, trusted.id);
  assert.equal(selection.top1?.decisionView.displayState, 'trusted');
});

test('falls through to provisional fallback when trusted candidates exist but none are homepage-ready', () => {
  const trustedButIneligible = createTrustedButIneligibleRepository(1);
  const provisional = Array.from({ length: 5 }, (_, index) =>
    createMediumProvisionalRepository(index + 2),
  );

  const selection = selectHomepageDecisionTerminal(
    [trustedButIneligible, ...provisional],
    new Map(),
    getBehaviorMemoryProfile(),
  );

  assert.equal(selection.selectionMode, 'provisional');
  assert.equal(selection.top1?.decisionView.displayState, 'provisional');
  assert.notEqual(selection.top1?.repository.id, trustedButIneligible.id);
});

test('new opportunities strip uses softer copy instead of the empty state in provisional fallback mode', () => {
  const items = Array.from({ length: 5 }, (_, index) =>
    createStrongProvisionalRepository(index + 1),
  );

  const html = renderToStaticMarkup(<HomeNewOpportunitiesStrip items={items} />);

  assert.match(html, /值得先补一轮证据/);
  assert.doesNotMatch(html, /data-home-empty-state="true"/);
});

test('falls back to recovery candidates when trusted and provisional pools are both empty', () => {
  const items = Array.from({ length: 5 }, (_, index) =>
    createRecoveryRepository(index + 1),
  );

  const selection = selectHomepageDecisionTerminal(
    items,
    new Map(),
    getBehaviorMemoryProfile(),
  );

  assert.equal(selection.selectionMode, 'recovery');
  assert.ok(selection.top1);
  assert.equal(selection.top3.length, 3);
  assert.equal(selection.newOpportunities.length, 1);
});

test('recovery selection keeps the homepage in evidence-recovery copy instead of empty state', () => {
  const items = Array.from({ length: 5 }, (_, index) =>
    createRecoveryRepository(index + 1),
  );

  const html = renderToStaticMarkup(<HomeNewOpportunitiesStrip items={items} />);

  assert.match(html, /还没到高信任结论/);
  assert.match(html, /值得先补一轮证据/);
  assert.doesNotMatch(html, /data-home-empty-state="true"/);
});
