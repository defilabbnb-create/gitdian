const COMPLETENESS_PROMPT_VERSION = 'completeness-v1';

function stringifyInput(input: unknown) {
  return JSON.stringify(input, null, 2);
}

export function buildCompletenessPrompt(input: unknown) {
  return {
    promptVersion: COMPLETENESS_PROMPT_VERSION,
    systemPrompt:
      'You assess whether a software repository is complete, runnable, maintainable, and close to real-world usability. Be skeptical and evidence-based. Return strict JSON only.',
    prompt: [
      'Evaluate the repository completeness and practical readiness.',
      'Do not praise the project. Judge whether it is actually usable and close to deployable or easy to extend.',
      'Use only the provided repository and content summary.',
      'Return JSON with this exact shape:',
      stringifyInput({
        completenessScore: 82,
        completenessLevel: 'HIGH',
        productionReady: true,
        runability: 'EASY',
        strengths: ['clear setup instructions'],
        weaknesses: ['missing test coverage'],
        summary: 'Short neutral summary.',
        dimensionScores: {
          documentation: 80,
          structure: 78,
          runability: 85,
          engineering: 70,
          maintenance: 76,
          extensibility: 74,
        },
      }),
      'Scoring rules:',
      '- completenessScore and dimension scores must be integers from 0 to 100.',
      '- completenessLevel must be HIGH, MEDIUM, or LOW.',
      '- runability must be EASY, MEDIUM, or HARD.',
      '- strengths and weaknesses should each contain 2 to 5 concise items.',
      '- summary must be short and factual.',
      '',
      'Repository input:',
      stringifyInput(input),
    ].join('\n'),
    schemaHint:
      '{"completenessScore": number, "completenessLevel": "HIGH"|"MEDIUM"|"LOW", "productionReady": boolean, "runability": "EASY"|"MEDIUM"|"HARD", "strengths": string[], "weaknesses": string[], "summary": string, "dimensionScores": {"documentation": number, "structure": number, "runability": number, "engineering": number, "maintenance": number, "extensibility": number}}',
  };
}

export { COMPLETENESS_PROMPT_VERSION };
