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
      <RepositoryDetailIdeaFit
        repository={repository}
        decisionViewModel={decisionView}
        showRunner={false}
      />
      <RepositoryDetailIdeaExtract
        repository={repository}
        decisionViewModel={decisionView}
        showRunner={false}
      />
      <RepositoryDetailCompleteness
        repository={repository}
        decisionViewModel={decisionView}
        showRunner={false}
      />
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

test('detail page renders only one priority label for the same repository', () => {
  const repository = createRepositoryFixture();
  const decisionView = buildRepositoryDecisionViewModel(repository, {
    relatedJobs: [],
  });
  const html = renderDetailPrimaryFlow(repository);
  const matches = html.match(new RegExp(decisionView.display.priorityLabel, 'g')) ?? [];

  assert.equal(matches.length, 1);
});

test('detail page renders exactly one primary CTA', () => {
  const repository = createRepositoryFixture();
  const html = renderDetailPrimaryFlow(repository);
  const matches = html.match(/data-detail-primary-cta="true"/g) ?? [];

  assert.equal(matches.length, 1);
  assert.match(html, /开始验证/);
});

test('provisional detail page does not show competing primary CTAs', () => {
  const repository = createProvisionalRepository();

  const html = renderDetailPrimaryFlow(repository);

  assert.match(html, /先补分析/);
  assert.doesNotMatch(html, /开始验证/);
});

test('non-deep detail page suppresses strong monetization copy', () => {
  const repository = createProvisionalRepository();

  const html = renderDetailPrimaryFlow(repository);

  assert.doesNotMatch(html, /可以做团队订阅/);
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
