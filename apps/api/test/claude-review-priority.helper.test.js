const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveClaudeReviewPriority,
  shouldSkipClaudeReviewByStrength,
} = require('../dist/modules/analysis/helpers/claude-review-priority.helper');

test('homepage and daily-summary sources are forced to P0', () => {
  assert.equal(
    resolveClaudeReviewPriority({
      source: 'homepage_money_first',
      localVerdict: 'OK',
      localAction: 'CLONE',
      projectType: 'tool',
    }),
    'P0',
  );

  assert.equal(
    resolveClaudeReviewPriority({
      source: 'daily_summary',
      localVerdict: 'GOOD',
      localAction: 'BUILD',
      projectType: 'tool',
    }),
    'P0',
  );
});

test('good build and top money priority go to P1', () => {
  assert.equal(
    resolveClaudeReviewPriority({
      localVerdict: 'GOOD',
      localAction: 'BUILD',
      projectType: 'tool',
    }),
    'P1',
  );

  assert.equal(
    resolveClaudeReviewPriority({
      localVerdict: 'OK',
      localAction: 'CLONE',
      moneyPriority: 'P0',
      projectType: 'tool',
    }),
    'P1',
  );
});

test('boundary infra/model cases are reviewed as P2 instead of falling to P3', () => {
  assert.equal(
    resolveClaudeReviewPriority({
      localVerdict: 'OK',
      localAction: 'CLONE',
      projectType: 'infra',
      hasRealUser: true,
      hasClearUseCase: true,
    }),
    'P2',
  );
});

test('audit remains lowest priority', () => {
  assert.equal(
    resolveClaudeReviewPriority({
      source: 'audit',
      localVerdict: 'GOOD',
      localAction: 'BUILD',
      projectType: 'tool',
    }),
    'P3',
  );
});

test('strong one-liners are promoted to at least P1', () => {
  assert.equal(
    resolveClaudeReviewPriority({
      oneLinerStrength: 'STRONG',
      localVerdict: 'OK',
      localAction: 'CLONE',
      projectType: 'tool',
    }),
    'P1',
  );
});

test('strong one-liners do not override existing P0 priority', () => {
  assert.equal(
    resolveClaudeReviewPriority({
      source: 'telegram',
      oneLinerStrength: 'STRONG',
      localVerdict: 'OK',
      localAction: 'CLONE',
      projectType: 'tool',
    }),
    'P0',
  );
});

test('weak one-liners are marked for Claude skip', () => {
  assert.equal(shouldSkipClaudeReviewByStrength('WEAK'), true);
  assert.equal(shouldSkipClaudeReviewByStrength('MEDIUM'), false);
  assert.equal(shouldSkipClaudeReviewByStrength('STRONG'), false);
});
