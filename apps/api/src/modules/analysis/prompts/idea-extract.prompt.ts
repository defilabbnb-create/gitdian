const IDEA_EXTRACT_PROMPT_VERSION = 'idea-extract-v1';

function stringifyInput(input: unknown) {
  return JSON.stringify(input, null, 2);
}

export function buildIdeaExtractPrompt(input: unknown) {
  return {
    promptVersion: IDEA_EXTRACT_PROMPT_VERSION,
    systemPrompt:
      'You turn open-source software into product opportunities. You are not summarizing code. You are extracting a startup idea that can be rebuilt, repackaged, and commercialized. Use product language, not engineering language. Return strict JSON only.',
    prompt: [
      'Extract a startup-ready product idea from this repository context.',
      'Do not just repeat repository features.',
      'Think like a founder rebuilding the idea as a SaaS, plugin, API, tool site, or internal tool.',
      'Focus on user pain, product shape, MVP scope, monetization, timing, and realistic risks.',
      'Be critical. Risks must be real and not empty.',
      'Return JSON with this exact shape:',
      stringifyInput({
        ideaSummary: 'A short product idea sentence.',
        problem: 'What painful problem exists and why it matters.',
        solution: 'What product we would build.',
        targetUsers: ['indie developers', 'ops teams'],
        productForm: 'SAAS',
        mvpPlan: 'A 7-14 day MVP plan.',
        differentiation: 'How to make it more valuable than the original project.',
        monetization: 'How this can make money.',
        whyNow: 'Why this timing is attractive now.',
        risks: ['crowded market'],
        confidence: 81,
      }),
      'Rules:',
      '- productForm must be one of SAAS, PLUGIN, API, TOOL_SITE, INTERNAL_TOOL.',
      '- confidence must be an integer from 0 to 100.',
      '- targetUsers should contain 1 to 5 clear user groups.',
      '- risks should contain 2 to 5 real risks.',
      '- Write in product language, not code commentary.',
      '',
      'Repository input:',
      stringifyInput(input),
    ].join('\n'),
    schemaHint:
      '{"ideaSummary": string, "problem": string, "solution": string, "targetUsers": string[], "productForm": "SAAS"|"PLUGIN"|"API"|"TOOL_SITE"|"INTERNAL_TOOL", "mvpPlan": string, "differentiation": string, "monetization": string, "whyNow": string, "risks": string[], "confidence": number}',
  };
}

export { IDEA_EXTRACT_PROMPT_VERSION };
