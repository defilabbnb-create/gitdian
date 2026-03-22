const IDEA_FIT_PROMPT_VERSION = 'idea-fit-v1';

function stringifyInput(input: unknown) {
  return JSON.stringify(input, null, 2);
}

export function buildIdeaFitPrompt(input: unknown) {
  return {
    promptVersion: IDEA_FIT_PROMPT_VERSION,
    systemPrompt:
      'You are evaluating startup opportunity fit for internet tools, SaaS, automation products, plugins, and API services. You are not evaluating code quality. Be critical, commercially minded, and evidence-based. Return strict JSON only.',
    prompt: [
      'Evaluate whether this repository direction is worth tracking as an internet tool startup opportunity.',
      'This is not a code review and not a completeness review.',
      'Stars are a weak signal only and must not dominate the judgment.',
      'Judge from the perspective of building a productized tool, SaaS, plugin, or API service.',
      'Be skeptical. Identify real negative flags. Do not default to praise.',
      'Return JSON with this exact shape:',
      stringifyInput({
        ideaFitScore: 84,
        opportunityLevel: 'A',
        decision: 'Worth prioritizing for further validation',
        coreJudgement: 'Short, clear judgement.',
        scores: {
          realDemand: 88,
          toolProductization: 86,
          monetization: 79,
          competitiveBreakthrough: 73,
          timingTailwind: 81,
          executionFeasibility: 87,
          founderFit: 90,
        },
        negativeFlags: ['crowded category with weak differentiation'],
        opportunityTags: ['workflow', 'automation', 'b2b'],
      }),
      'Rules:',
      '- ideaFitScore and all score fields must be integers from 0 to 100.',
      '- opportunityLevel must be one of S, A, B, C.',
      '- negativeFlags must contain at least 1 real risk or weakness.',
      '- opportunityTags should contain 2 to 6 short tags.',
      '- decision and coreJudgement must be concise and specific.',
      '',
      'Repository input:',
      stringifyInput(input),
    ].join('\n'),
    schemaHint:
      '{"ideaFitScore": number, "opportunityLevel": "S"|"A"|"B"|"C", "decision": string, "coreJudgement": string, "scores": {"realDemand": number, "toolProductization": number, "monetization": number, "competitiveBreakthrough": number, "timingTailwind": number, "executionFeasibility": number, "founderFit": number}, "negativeFlags": string[], "opportunityTags": string[]}',
  };
}

export { IDEA_FIT_PROMPT_VERSION };
