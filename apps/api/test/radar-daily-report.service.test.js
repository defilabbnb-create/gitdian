const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRepositoryDecisionDisplaySummary,
} = require('../dist/modules/analysis/helpers/repository-final-decision.helper');
const {
  RadarDailyReportService,
} = require('../dist/modules/github/radar-daily-report.service');

function createService(overrides = {}) {
  const summaryService = {
    getLatestSummary: async () => null,
    getSummaryByDate: async () => null,
    markTelegramSendFailure: async () => {},
    markTelegramSendSuccess: async () => {},
    markSummaryForRecompute: async () => {},
    ...overrides.summaryService,
  };
  const telegramNotifierService = {
    isEnabled: () => true,
    isConfigured: () => true,
    sendMessage: async () => ({ messageId: 'msg-1' }),
    ...overrides.telegramNotifierService,
  };
  const claudeReviewService = {
    isEnabled: () => false,
    isConfigured: () => false,
    reviewRepositoryIds: async () => ({ results: [] }),
    ...overrides.claudeReviewService,
  };

  return new RadarDailyReportService(
    summaryService,
    telegramNotifierService,
  );
}

test('sendLatestSummary stays idempotent after telegram was already sent', async () => {
  const service = createService({
    summaryService: {
      getLatestSummary: async () => ({
        date: '2026-03-24',
        telegramSendStatus: 'SENT',
        telegramSentAt: '2026-03-24T08:00:00.000Z',
        telegramMessageId: '42',
      }),
      getSummaryByDate: async () => ({
        date: '2026-03-24',
        telegramSendStatus: 'SENT',
        telegramSentAt: '2026-03-24T08:00:00.000Z',
        telegramMessageId: '42',
      }),
    },
  });

  const result = await service.sendLatestSummary();

  assert.equal(result.status, 'already_sent');
  assert.equal(result.messageId, '42');
});

test('telegram text prefers unified decision summary wording', () => {
  const service = createService();
  const decisionSummary = buildRepositoryDecisionDisplaySummary({
    oneLinerZh: '给平台工程团队做临时提权审批和审计的工作流工具',
    verdict: 'GOOD',
    action: 'BUILD',
    categoryLabelZh: '工具类 / 安全工具',
    moneyPriority: 'P0',
    reasonZh: '用户明确、风险痛点明确，而且很适合团队订阅收费。',
    sourceLabelZh: 'Claude 复核',
    moneyDecision: {
      recommendedMoveZh: '更适合你亲自做成产品',
      targetUsersZh: '平台工程团队 / 安全团队',
      monetizationSummaryZh: '可以从团队订阅和审计能力收费。',
    },
  });

  const summary = {
    date: '2026-03-24',
    fetchedRepositories: 12,
    snapshotGenerated: 9,
    deepAnalyzed: 4,
    goodIdeas: 2,
    cloneCandidates: 1,
    ignoredIdeas: 3,
    topMustBuildItems: [
      {
        repositoryId: 'repo-1',
        fullName: 'acme/platform-guard',
        oneLinerZh: '旧的一句话',
        verdict: 'GOOD',
        action: 'BUILD',
        category: { main: 'tools', sub: 'security' },
        moneyPriorityLabelZh: 'P0 · 能赚钱',
        moneyPriorityReasonZh: '旧原因',
        moneyDecisionLabelZh: '🔥 必做',
        recommendedMoveZh: '旧动作',
        decisionSummary,
      },
    ],
    topHighValueItems: [],
    topCloneableItems: [],
    topKeywordGroups: [],
    latestClaudeAudit: null,
  };

  const text = service.buildDailyReportText(summary);

  assert.match(text, /一句话：给平台工程团队做临时提权审批和审计的工作流工具/);
  assert.match(text, /结论：值得做 · 做/);
  assert.match(text, /建议动作：更适合你亲自做成产品/);
  assert.match(text, /原因：用户明确、风险痛点明确，而且很适合团队订阅收费。/);
});
