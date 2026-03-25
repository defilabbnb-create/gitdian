import { buildClaudeRoleDefinitionText } from '../claude-role-definition';

export const CLAUDE_QUALITY_AUDIT_PROMPT_VERSION = 'claude-quality-audit-v2';

function stringifyInput(input: unknown) {
  return JSON.stringify(input, null, 2);
}

export function buildClaudeQualityAuditPrompt(input: unknown) {
  return {
    promptVersion: CLAUDE_QUALITY_AUDIT_PROMPT_VERSION,
    systemPrompt: [
      'You are the global quality control layer for a GitHub startup-opportunity radar.',
      'You do not summarize technology for its own sake.',
      'You inspect whether the system is too optimistic, too conservative, or drifting in its product judgment.',
      'The local 122B model is the throughput engine. You inspect how it is drifting, where Claude disagrees, and what should be improved next.',
      'You must identify systematic mistakes, suggest local-model improvements, and name repositories that should be reviewed or recomputed.',
      'Return strict JSON only.',
    ].join(' '),
    prompt: [
      'Audit the current GitHub Radar judgments at a system level.',
      '',
      'Claude role definition:',
      buildClaudeRoleDefinitionText(),
      '',
      'Audit goals:',
      '- Decide whether the system is currently too optimistic, too conservative, or balanced.',
      '- Identify the most common mistake types.',
      '- Use reviewDiffSummary and trainingHintsSummary as signals about where the local model and Claude disagree the most.',
      '- Point out which repositories deserve follow-up review.',
      '- Suggest whether prompts, heuristics, or anchors should be adjusted.',
      '- Pay special attention to local_fallback results and where they may diverge from Claude.',
      '',
      'Bias questions you must answer:',
      '1. Are recent GOOD judgments too optimistic?',
      '2. Are recent CLONE judgments too conservative?',
      '3. Are one-liners still generic or drifting?',
      '4. Are model / infra / demo / template projects still leaking through?',
      '5. Which rule family should be fixed first?',
      '',
      'Return JSON with exact shape:',
      stringifyInput({
        summary: '整体略偏保守，开发者工具被压成 CLONE 的情况仍然偏多。',
        highPriorityHeadline: '开发者工作流工具仍被过度压成 CLONE',
        overallBias: {
          direction: 'too_conservative',
          reason:
            'GOOD 集合偏少，CLONE 集合里有一批边界清晰的开发者工具本应继续保留 GOOD + BUILD。',
        },
        collectionFindings: [
          {
            collection: 'recent_clone',
            bias: 'too_conservative',
            summary: '最近 CLONE 集合里有多条真实 developer workflow 工具被压低。',
          },
        ],
        problemTypes: [
          {
            type: 'tool_as_framework',
            count: 7,
            examples: [
              {
                repositoryId: 'repo_123',
                fullName: 'team/example-tool',
                currentVerdict: 'OK',
                currentAction: 'CLONE',
                suggestedVerdict: 'GOOD',
                suggestedAction: 'BUILD',
                reason: '这是有明确开发团队用户和清晰工作流边界的工具，不应被当成 framework。',
              },
            ],
          },
        ],
        suggestions: [
          '放宽 developer workflow tools 的 GOOD 判定条件，不再要求已验证收费闭环。',
          '补充 tool_as_framework 的 GOOD anchor 与反例。',
        ],
        fallbackGapSummary:
          'local_fallback 结果整体偏保守，尤其在 developer workflow tools 上更容易压成 CLONE。',
        repositoriesNeedingReview: ['repo_123', 'repo_456'],
        needsRecompute: ['repo_123'],
        needsPromptAdjustment: true,
        needsHeuristicAdjustment: true,
        recommendedActions: [
          {
            priority: 'P0',
            action: 'rerun_claude_review_for_top_good_and_top_clone',
            reason: '高价值集合里仍有明显偏差，值得优先复核。',
          },
          {
            priority: 'P1',
            action: 'update_devtool_anchor_examples',
            reason: 'developer tools 被错打成 framework 是当前主要误判来源。',
          },
        ],
      }),
      '',
      'Audit input:',
      stringifyInput(input),
    ].join('\n'),
    schemaHint:
      '{"summary":string,"highPriorityHeadline":string|null,"overallBias":{"direction":"too_optimistic"|"too_conservative"|"balanced","reason":string},"collectionFindings":[{"collection":string,"bias":"too_optimistic"|"too_conservative"|"balanced","summary":string}],"problemTypes":[{"type":string,"count":number,"examples":[{"repositoryId":string,"fullName":string,"currentVerdict":"GOOD"|"OK"|"BAD"|null,"currentAction":"BUILD"|"CLONE"|"IGNORE"|null,"suggestedVerdict":"GOOD"|"OK"|"BAD"|null,"suggestedAction":"BUILD"|"CLONE"|"IGNORE"|null,"reason":string}]}],"suggestions":string[],"fallbackGapSummary":string|null,"repositoriesNeedingReview":string[],"needsRecompute":string[],"needsPromptAdjustment":boolean,"needsHeuristicAdjustment":boolean,"recommendedActions":[{"priority":"P0"|"P1"|"P2","action":string,"reason":string}]}',
  };
}
