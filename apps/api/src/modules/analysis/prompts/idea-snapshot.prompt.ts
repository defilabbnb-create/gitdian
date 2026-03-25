const IDEA_SNAPSHOT_PROMPT_VERSION = 'idea-snapshot-v2';

function stringifyInput(input: unknown) {
  return JSON.stringify(input, null, 2);
}

export function buildIdeaSnapshotPrompt(input: unknown) {
  return {
    promptVersion: IDEA_SNAPSHOT_PROMPT_VERSION,
    systemPrompt:
      'You are generating a lightweight tool-opportunity snapshot from a GitHub repository. You are not doing a full code review. Be concise, skeptical, commercially minded, prioritize productizable tools over generic AI hype, and return strict JSON only.',
    prompt: [
      'Generate a first-pass tool opportunity snapshot from this repository.',
      'Use only lightweight signals such as name, description, topics, language, and optional README preview.',
      'Do not perform a full completeness review or a full startup scoring pass.',
      'Return Chinese for oneLinerZh and reason.',
      'Do not invent a product story when the repository only shows technical capability.',
      'If user or use case is unclear, oneLinerZh must describe the technical capability or direction instead of saying "一个帮谁做什么的工具".',
      'Do not use generic phrases such as "一个工具", "一个平台", "提升效率", "优化流程", or "自动化工具".',
      'It is acceptable to say the repository is closer to a technical implementation, capability sample, model implementation, or example project when evidence is weak.',
      'Judge whether this could become a productized tool, SaaS, workflow helper, automation utility, developer tool, data tool, infra utility, or AI product that users would actually use or pay for.',
      'Do not classify something as main=ai only because it mentions AI. If it is fundamentally a utility, developer tool, productivity workflow, browser extension, CLI, data tool, or infra helper, prefer main=tools, data, or infra.',
      'Keep negative signals in mind: template, boilerplate, tutorial, showcase, UI clone, pump, sniper, guaranteed profit, passive income.',
      'Favor strong tool opportunity signals: automation, workflow, productivity, devtools, browser-extension, scraping, data-pipeline, sdk, api, dashboard, auth, deploy, cli, no-code, integration.',
      'Classification must use the fixed taxonomy only.',
      'main must be one of: tools, platform, ai, data, infra, content, game, other.',
      'sub must be chosen from these allowed values:',
      '- tools: devtools, ai-tools, automation, data-tools, browser-extension, productivity, workflow, cli, no-code, ops-tools',
      '- platform: marketplace, app-builder, workflow-platform, developer-platform, api-platform',
      '- ai: ai-writing, ai-code, ai-agent, ai-image, ai-search',
      '- data: data-pipeline, analytics, scraping, etl, dataset, data-observability',
      '- infra: deployment, observability, auth, storage, api-gateway, devops, cloud, monitoring, security',
      '- content: content-creation, seo, publishing, media',
      '- game: game-tooling, game-content, game-platform',
      '- other: other',
      'nextAction must be one of KEEP, SKIP, DEEP_ANALYZE.',
      'Return JSON with this exact shape:',
      stringifyInput({
        oneLinerZh: '一个围绕命令行工作流的开发工具方向',
        isPromising: true,
        reason: '简短解释为什么值得或不值得继续看',
        category: {
          main: 'ai',
          sub: 'ai-agent',
        },
        toolLike: true,
        nextAction: 'DEEP_ANALYZE',
      }),
      '',
      'Repository input:',
      stringifyInput(input),
    ].join('\n'),
    schemaHint:
      '{"oneLinerZh": string, "isPromising": boolean, "reason": string, "category": {"main": "tools"|"platform"|"ai"|"data"|"infra"|"content"|"game"|"other", "sub": string}, "toolLike": boolean, "nextAction": "KEEP"|"SKIP"|"DEEP_ANALYZE"}',
  };
}

export { IDEA_SNAPSHOT_PROMPT_VERSION };
