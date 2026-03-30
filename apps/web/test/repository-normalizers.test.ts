import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRepositoryItem } from '../src/lib/api/normalizers';
import { createRepositoryFixture } from './helpers/repository-fixture';

test('normalizeRepositoryItem prefers concrete Chinese analysis copy over stale final-decision fields', () => {
  const repository = createRepositoryFixture({
    analysis: {
      ideaSnapshotJson: {
        oneLinerZh: '一款本地优先的代码片段管理 CLI 工具',
        category: {
          main: 'tools',
          sub: 'automation',
        },
      },
      insightJson: {
        oneLinerZh: '一个帮开发者记录 token 与成本明细的 CLI 工具',
        verdictReason: '冲突集中在 market',
        categoryDisplay: {
          main: '工具类',
          sub: '自动化工具',
          label: '工具类 / 自动化工具',
        },
      },
      extractedIdeaJson: {
        ideaSummary: '把常用代码片段集中管理并支持本地快速调用。',
        targetUsers: ['独立开发者'],
        monetization: '可以先按专业版订阅收费。',
      },
      moneyPriority: {
        targetUsersZh: '',
        monetizationSummaryZh: '',
        reasonZh: '',
      },
    },
    analysisState: {
      lightAnalysis: {
        targetUsers: '独立开发者',
        monetization: '可以先按专业版订阅收费。',
        whyItMatters: '冲突集中在 market',
        nextStep: '先补市场证据。',
        source: 'snapshot',
      },
    },
    finalDecision: {
      oneLinerZh: '一个帮开发者记录 token 与成本明细的 CLI 工具',
      categoryLabelZh: '',
      reasonZh: '',
      moneyDecision: {
        targetUsersZh: '',
        monetizationSummaryZh: '',
        reasonZh: '',
      },
      decisionSummary: {
        headlineZh: '一个帮开发者记录 token 与成本明细的 CLI 工具',
        categoryLabelZh: '',
        targetUsersZh: '',
        monetizationSummaryZh: '',
        reasonZh: '',
      },
    },
  });

  const normalized = normalizeRepositoryItem(repository);

  assert.equal(
    normalized.finalDecision?.oneLinerZh,
    '一款本地优先的代码片段管理 CLI 工具',
  );
  assert.equal(
    normalized.finalDecision?.decisionSummary.headlineZh,
    '一款本地优先的代码片段管理 CLI 工具',
  );
  assert.equal(
    normalized.finalDecision?.decisionSummary.categoryLabelZh,
    '工具类、自动化工具',
  );
  assert.equal(
    normalized.finalDecision?.moneyDecision.targetUsersZh,
    '独立开发者',
  );
  assert.equal(
    normalized.finalDecision?.moneyDecision.monetizationSummaryZh,
    '可以先按专业版订阅收费。',
  );
  assert.match(normalized.finalDecision?.reasonZh ?? '', /市场/);
  assert.doesNotMatch(normalized.finalDecision?.reasonZh ?? '', /market/);
});
