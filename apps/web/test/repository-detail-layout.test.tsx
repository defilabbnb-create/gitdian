import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RepositoryDetailConclusion } from '../src/components/repositories/repository-detail-conclusion';
import { RepositoryDetailCompleteness } from '../src/components/repositories/repository-detail-completeness';
import { RepositoryDetailHeader } from '../src/components/repositories/repository-detail-header';
import { RepositoryDetailIdeaExtract } from '../src/components/repositories/repository-detail-idea-extract';
import { RepositoryDetailIdeaFit } from '../src/components/repositories/repository-detail-idea-fit';
import { RepositoryNextStepsPanel } from '../src/components/repositories/repository-next-steps';
import { buildRepositoryDecisionViewModel } from '../src/lib/repository-decision-view-model';
import { createRepositoryFixture } from './helpers/repository-fixture';

function renderDetailPrimaryFlow(
  repository: ReturnType<typeof createRepositoryFixture>,
) {
  const decisionView = buildRepositoryDecisionViewModel(repository, {
    relatedJobs: [],
  });

  return renderToStaticMarkup(
    <div>
      <RepositoryDetailHeader
        repository={repository}
        decisionViewModel={decisionView}
      />
      <RepositoryDetailConclusion decisionViewModel={decisionView} />
      <RepositoryDetailIdeaFit decisionViewModel={decisionView} />
      <RepositoryDetailIdeaExtract decisionViewModel={decisionView} />
      <RepositoryDetailCompleteness decisionViewModel={decisionView} />
      <RepositoryNextStepsPanel
        htmlUrl={repository.htmlUrl}
        decisionViewModel={decisionView}
        statusLabel="未开始"
        isSubmitting={false}
        isActiveFollowUp={false}
        feedback={null}
        errorMessage={null}
      />
    </div>,
  );
}

function createProvisionalRepository() {
  return createRepositoryFixture({
    analysis: {
      deepAnalysisStatus: 'NOT_STARTED',
      ideaFitJson: null,
      extractedIdeaJson: null,
      completenessJson: null,
    },
    analysisState: {
      analysisStatus: 'DISPLAY_READY',
      displayStatus: 'TRUSTED_READY',
      deepReady: false,
      fullDeepReady: false,
      lightDeepReady: false,
      fullyAnalyzed: false,
      incompleteReason: 'NO_DEEP_ANALYSIS',
      incompleteReasons: ['NO_DEEP_ANALYSIS'],
    },
  });
}

function createDeepCompleteConflictRepository() {
  return createRepositoryFixture({
    analysisState: {
      analysisStatus: 'REVIEW_PENDING',
      displayStatus: 'BASIC_READY',
      deepReady: true,
      fullDeepReady: true,
      lightDeepReady: true,
      fullyAnalyzed: true,
    },
    finalDecision: {
      hasConflict: true,
      decisionSummary: {
        finalDecisionLabelZh: '值得做 · 立即做',
        actionLabelZh: '适合直接做',
        worthDoingLabelZh: '现在值得继续推进',
      },
      moneyDecision: {
        recommendedMoveZh: '立即做',
        monetizationSummaryZh: '可以做团队订阅',
      },
    },
  });
}

function createRepositoryWithEnglishAnalysis() {
  return createRepositoryFixture({
    analysis: {
      ideaFitJson: {
        coreJudgement:
          'This repository looks promising for small teams, but the monetization path still needs validation across real user demand.',
      },
      extractedIdeaJson: {
        ideaSummary:
          'This tool helps solo founders automate deployment workflows and package them as a repeatable service.',
      },
      completenessJson: {
        summary:
          'The repository structure is clean and the setup path is understandable, but production readiness still depends on additional validation.',
      },
    },
  });
}

function createHistoricalRepairRepository() {
  return createRepositoryFixture({
    description:
      'Chrome/Firefox extension for UEU deans — Salesforce overlay and convenience UI',
    analysis: {
      ideaSnapshotJson: {
        oneLinerZh:
          'Unity-Environmental-University 的教务人员使用的 Chrome、Firefox 浏览器扩展，用于在 Stratus 和 Canvas 系统间叠加 Salesforce 界面并简化学生成绩查看流程。',
      },
      extractedIdeaJson: {
        extractMode: 'light',
        ideaSummary: '一个用于部署和交付应用的基础设施组件，主要面向开发者',
        targetUsers: ['开发者和小团队'],
      },
    },
    analysisState: {
      analysisStatus: 'REVIEW_PENDING',
      displayStatus: 'UNSAFE',
      frontendDecisionState: 'degraded',
      displayStatusReason: 'historical_repair_guard:decision_recalc',
      analysisStatusReason: '冲突集中在 user / monetization / execution',
      trustedDisplayReady: false,
      highConfidenceReady: false,
      fullyAnalyzed: false,
      unsafe: true,
      incompleteReason: 'NO_CLAUDE_REVIEW',
      incompleteReasons: ['NO_CLAUDE_REVIEW'],
      lightAnalysis: {
        targetUsers: '开发者和小团队',
        monetization: '收费路径暂时不够清楚，先用访谈或试运行确认是否有人愿意为它付费。',
        whyItMatters: '冲突集中在 user / monetization / execution',
        caution: '当前存在 user冲突 / monetization冲突 / execution冲突，继续推进前应先重算判断。',
        nextStep:
          '暂不投入，先放进观察池；只有当后面出现更明确用户、价值或收费路径时再继续。',
        source: 'snapshot',
      },
    },
    finalDecision: {
      oneLinerZh: '一个帮开发者部署和交付应用的浏览器扩展',
      reasonZh: '这是个典型工具型机会，问题明确，也有机会很快包装成收费产品。',
      decisionSummary: {
        headlineZh: '一个帮开发者部署和交付应用的浏览器扩展',
        categoryLabelZh: '工具类 / 浏览器扩展',
        targetUsersZh: '开发者和小团队',
        reasonZh: '这是个典型工具型机会，问题明确，也有机会很快包装成收费产品。',
      },
      evidenceDecision: {
        summaryZh:
          '当前判断由 user冲突 / monetization冲突 / execution冲突 卡住，必须先重算判断。',
      } as any,
    } as any,
  });
}

test('detail page renders only one priority label for the same repository', () => {
  const repository = createRepositoryFixture();
  const decisionView = buildRepositoryDecisionViewModel(repository, {
    relatedJobs: [],
  });
  const html = renderDetailPrimaryFlow(repository);
  const matches = html.match(new RegExp(decisionView.display.priorityLabel, 'g')) ?? [];

  assert.equal(matches.length, 1);
});

test('detail page keeps only one main judgement row in the primary flow', () => {
  const repository = createRepositoryFixture();
  const html = renderDetailPrimaryFlow(repository);
  const judgementRows = html.match(/现在结论/g) ?? [];

  assert.equal(judgementRows.length, 1);
});

test('detail conclusion section focuses on triage framing instead of repeating headline title', () => {
  const repository = createRepositoryFixture();
  const html = renderDetailPrimaryFlow(repository);

  assert.match(html, /先判断为什么会停、卡在哪里、要不要补跑/);
});

test('detail page renders exactly one primary CTA', () => {
  const repository = createRepositoryFixture();
  const html = renderDetailPrimaryFlow(repository);
  const matches = html.match(/data-detail-primary-cta="true"/g) ?? [];

  assert.equal(matches.length, 1);
  assert.match(html, /开始验证/);
});

test('next steps panel surfaces status, blocking signal, and rerun judgement before CTA', () => {
  const repository = createRepositoryFixture();
  const html = renderDetailPrimaryFlow(repository);

  assert.match(html, /任务状态/);
  assert.match(html, /当前卡点/);
  assert.match(html, /补跑判断/);
});

test('detail action panel keeps follow-up naming aligned with favorites page', () => {
  const repository = createRepositoryFixture();
  const html = renderDetailPrimaryFlow(repository);

  assert.match(html, /加入跟进清单/);
  assert.doesNotMatch(html, /加入跟进<\/button>/);
});

test('provisional detail page does not show competing primary CTAs', () => {
  const repository = createProvisionalRepository();

  const html = renderDetailPrimaryFlow(repository);

  assert.match(html, /先补分析/);
  assert.doesNotMatch(html, /开始验证/);
});

test('non-deep detail page keeps concrete monetization clue with caution copy', () => {
  const repository = createProvisionalRepository();

  const html = renderDetailPrimaryFlow(repository);

  assert.match(html, /可以做团队订阅/);
  assert.match(html, /待验证线索/);
});

test('deep-complete degraded page does not fall back to analyze CTA', () => {
  const repository = createDeepCompleteConflictRepository();
  const html = renderDetailPrimaryFlow(repository);

  assert.match(html, /先观察/);
  assert.doesNotMatch(html, /先补分析/);
  assert.doesNotMatch(html, /关键 deep 证据已经补齐/);
});

test('degraded detail page does not leak strong actions from analysis modules', () => {
  const repository = createDeepCompleteConflictRepository();
  const html = renderDetailPrimaryFlow(repository);

  assert.doesNotMatch(html, /立即做/);
  assert.doesNotMatch(html, /可以继续投入/);
  assert.doesNotMatch(html, /验证通过（可做）/);
  assert.doesNotMatch(html, /值得优先验证/);
});

test('analysis modules render as collapsed summary cards by default', () => {
  const repository = createRepositoryFixture();
  const html = renderDetailPrimaryFlow(repository);
  const matches = html.match(/data-detail-module="/g) ?? [];

  assert.equal(matches.length, 3);
  assert.doesNotMatch(html, /<details[^>]*open/);
});

test('detail primary flow does not render raw English analysis paragraphs', () => {
  const repository = createRepositoryWithEnglishAnalysis();
  const html = renderDetailPrimaryFlow(repository);

  assert.doesNotMatch(
    html,
    /This repository looks promising for small teams/,
  );
  assert.doesNotMatch(
    html,
    /This tool helps solo founders automate deployment workflows/,
  );
  assert.doesNotMatch(
    html,
    /The repository structure is clean and the setup path is understandable/,
  );
  assert.match(html, /查看原始分析/);
});

test('detail primary flow does not surface internal rerun actions', () => {
  const repository = createRepositoryFixture();
  const html = renderDetailPrimaryFlow(repository);

  assert.doesNotMatch(html, /补创业评分/);
  assert.doesNotMatch(html, /补点子提取/);
  assert.doesNotMatch(html, /补完整性分析/);
});

test('historical repair detail header keeps content clue but hides stale persona and category labels', () => {
  const repository = createHistoricalRepairRepository();
  const html = renderDetailPrimaryFlow(repository);

  assert.match(html, /教务人员|Salesforce|成绩查看流程/);
  assert.doesNotMatch(html, /帮独立开发者管理部署流程/);
  assert.match(html, /目标用户标签待复核，先按仓库实际使用场景重新确认。/);
  assert.match(html, /分类待复核，等重算后再确认。/);
});
