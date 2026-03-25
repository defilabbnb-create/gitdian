const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateIdeaExtractGate,
} = require('../dist/modules/analysis/helpers/idea-extract-gate.helper');

const boostedKnowledge = {
  templateDetectionBoost: 0.3,
  modelInfraLeakageBoost: 0.4,
  earlyGoodGuard: 0.3,
};

test('lets template and scaffold repositories fall back to light extract', () => {
  const decision = evaluateIdeaExtractGate({
    snapshotIsPromising: true,
    toolLike: true,
    verdict: 'OK',
    ideaFitScore: 72,
    readmeLength: 1200,
    categoryMain: 'tools',
    haystack: 'starter scaffold template for ai apps with boilerplate and demo project',
    projectRealityType: 'demo',
    heuristicAdjustments: boostedKnowledge,
  });

  assert.equal(decision.shouldRun, true);
  assert.equal(decision.reason, 'eligible_light_value');
  assert.equal(decision.mode, 'light');
});

test('lets capability-layer infra repositories fall back to light extract', () => {
  const decision = evaluateIdeaExtractGate({
    snapshotIsPromising: true,
    toolLike: true,
    verdict: 'GOOD',
    ideaFitScore: 81,
    readmeLength: 1800,
    categoryMain: 'infra',
    haystack: 'multi model router provider proxy gateway orchestration framework for agent runtime',
    projectRealityType: 'infra',
    heuristicAdjustments: boostedKnowledge,
  });

  assert.equal(decision.shouldRun, true);
  assert.equal(decision.reason, 'eligible_light_value');
  assert.equal(decision.mode, 'light');
});

test('keeps qualified developer workflow tools eligible for L2', () => {
  const decision = evaluateIdeaExtractGate({
    snapshotIsPromising: true,
    toolLike: true,
    verdict: 'GOOD',
    ideaFitScore: 83,
    readmeLength: 2200,
    categoryMain: 'tools',
    haystack:
      'developer workflow approval audit dashboard for platform teams to review temporary access requests and automate policy checks',
    projectRealityType: 'tool',
    heuristicAdjustments: boostedKnowledge,
  });

  assert.equal(decision.shouldRun, true);
  assert.equal(decision.reason, 'eligible_light_value');
  assert.equal(decision.mode, 'light');
  assert.ok(decision.trace.includes('clear_use_case'));
});

test('keeps weak monetization candidates on light extract instead of dropping them', () => {
  const decision = evaluateIdeaExtractGate({
    snapshotIsPromising: true,
    toolLike: true,
    verdict: 'OK',
    ideaFitScore: 74,
    readmeLength: 1600,
    categoryMain: 'tools',
    haystack:
      'open source helper script for developers to try small terminal shortcuts and personal snippets',
    projectRealityType: 'tool',
    heuristicAdjustments: boostedKnowledge,
  });

  assert.equal(decision.shouldRun, true);
  assert.equal(decision.reason, 'eligible_light_value');
  assert.equal(decision.mode, 'light');
});

test('routes STRONG one-liners directly into L2', () => {
  const decision = evaluateIdeaExtractGate({
    snapshotIsPromising: true,
    toolLike: true,
    verdict: 'GOOD',
    oneLinerStrength: 'STRONG',
    ideaFitScore: 56,
    readmeLength: 120,
    categoryMain: 'tools',
    haystack: 'security review workflow for platform teams',
    projectRealityType: 'tool',
    heuristicAdjustments: boostedKnowledge,
  });

  assert.equal(decision.shouldRun, true);
  assert.equal(decision.reason, 'eligible_high_value');
  assert.equal(decision.mode, 'full');
  assert.ok(decision.trace.includes('one_liner_strength_strong'));
});

test('allows MEDIUM one-liners to continue through original gating', () => {
  const decision = evaluateIdeaExtractGate({
    snapshotIsPromising: true,
    toolLike: true,
    verdict: 'GOOD',
    oneLinerStrength: 'MEDIUM',
    ideaFitScore: 90,
    readmeLength: 2400,
    categoryMain: 'tools',
    haystack: 'developer workflow approval audit tool',
    projectRealityType: 'tool',
    heuristicAdjustments: boostedKnowledge,
  });

  assert.equal(decision.shouldRun, true);
  assert.equal(decision.reason, 'eligible_light_value');
  assert.equal(decision.mode, 'light');
});

test('blocks WEAK one-liners from entering L2', () => {
  const decision = evaluateIdeaExtractGate({
    snapshotIsPromising: true,
    toolLike: true,
    verdict: 'OK',
    oneLinerStrength: 'WEAK',
    ideaFitScore: 70,
    readmeLength: 1200,
    categoryMain: 'tools',
    haystack: 'generic tool for developers',
    projectRealityType: 'tool',
    heuristicAdjustments: boostedKnowledge,
  });

  assert.equal(decision.shouldRun, false);
  assert.equal(decision.reason, 'strength_not_strong');
  assert.equal(decision.mode, 'skip');
});

test('keeps MEDIUM one-liners eligible for light extract under EXTREME load', () => {
  const decision = evaluateIdeaExtractGate({
    snapshotIsPromising: true,
    toolLike: true,
    verdict: 'GOOD',
    oneLinerStrength: 'MEDIUM',
    loadLevel: 'EXTREME',
    ideaFitScore: 90,
    readmeLength: 2400,
    categoryMain: 'tools',
    haystack: 'developer workflow approval audit tool',
    projectRealityType: 'tool',
    heuristicAdjustments: boostedKnowledge,
  });

  assert.equal(decision.shouldRun, true);
  assert.equal(decision.reason, 'eligible_light_value');
  assert.equal(decision.mode, 'light');
});

test('can force light extract even for WEAK one-liners when repository needs recheck', () => {
  const decision = evaluateIdeaExtractGate({
    snapshotIsPromising: false,
    toolLike: false,
    verdict: 'BAD',
    oneLinerStrength: 'WEAK',
    forceLightAnalysis: true,
    ideaFitScore: 20,
    readmeLength: 120,
    categoryMain: 'infra',
    haystack: 'model runtime proxy gateway',
    projectRealityType: 'infra',
    heuristicAdjustments: boostedKnowledge,
  });

  assert.equal(decision.shouldRun, true);
  assert.equal(decision.reason, 'eligible_light_value');
  assert.equal(decision.mode, 'light');
  assert.ok(decision.trace.includes('forced_light_analysis'));
});
