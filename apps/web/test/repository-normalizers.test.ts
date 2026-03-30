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

test('normalizeRepositoryItem keeps concrete snapshot reason and inferred users ahead of repair-only hints', () => {
  const repository = createRepositoryFixture({
    analysis: {
      ideaSnapshotJson: {
        oneLinerZh: 'macOS 用户利用本地大模型进行会议转录和语音输入，产出纯文本记录。',
        reason:
          '明确针对macOS本地隐私场景，对标Granola和WisprFlow，具备清晰的SaaS或独立应用商业化路径。',
      },
      extractedIdeaJson: {
        ideaSummary: '一个帮开发者在命令行里搜索歌曲并管理播放列表的 CLI 工具',
        targetUsers: ['开发者和小团队'],
      },
      moneyPriority: {
        targetUsersZh: '开发者和小团队',
        reasonZh: '技术成熟度 证据偏弱',
      },
    },
    analysisState: {
      lightAnalysis: {
        targetUsers: '开发者和小团队',
        whyItMatters: 'technical_maturity 证据偏弱',
        source: 'snapshot',
      },
    },
    finalDecision: {
      reasonZh: '这个方向需求明确，虽然同类不少，但只要切口更准，还是值得继续做。',
      moneyDecision: {
        targetUsersZh: '开发者和小团队',
        reasonZh:
          '这是面向明确开发者 / 团队工作流的真工具，用户、场景和产品边界都比较清楚，而且小团队有现实机会把它快速包装成可收费产品。',
      },
      decisionSummary: {
        targetUsersZh: '开发者和小团队',
        reasonZh: '技术成熟度 证据偏弱',
      },
    },
  });

  const normalized = normalizeRepositoryItem(repository);

  assert.equal(normalized.finalDecision?.decisionSummary.targetUsersZh, 'macOS 用户');
  assert.equal(
    normalized.finalDecision?.decisionSummary.reasonZh,
    '明确针对macOS本地隐私场景，具备清晰的订阅式或独立应用商业化路径。',
  );
  assert.doesNotMatch(normalized.finalDecision?.decisionSummary.reasonZh ?? '', /Granola|WisprFlow|SaaS/);
  assert.doesNotMatch(normalized.finalDecision?.decisionSummary.reasonZh ?? '', /技术成熟度/);
});
