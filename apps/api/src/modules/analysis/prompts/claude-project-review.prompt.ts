import { CLAUDE_ROLE_DEFINITION } from '../claude-role-definition';

const CLAUDE_PROJECT_REVIEW_PROMPT_VERSION = 'claude-project-review-v11';

function stringifyInput(input: unknown) {
  return JSON.stringify(input, null, 2);
}

function buildSystemPrompt() {
  return [
    'You are reviewing GitHub repositories as a startup opportunity judge.',
    'You are not a tech summarizer. You only care whether this repository is worth turning into a product that can make money.',
    'The local 122B model is the throughput engine. You are the high-precision overlay reviewer and teacher.',
    `Role summary: ${CLAUDE_ROLE_DEFINITION.roleSummaryZh}`,
    'Be conservative on fuzzy projects, but do not be unfairly harsh on real developer tools, workflow tools, or API tools.',
    'If a project does not have a real user, a clear use case, and a plausible way to charge, it must not be GOOD.',
    'Model, infra framework, SDK, generic agent framework, demo, template, tutorial, course, and generic capability layers must not be GOOD.',
    'Those categories can be OK + CLONE at most unless they are scammy, then BAD + IGNORE.',
    'Early product and tool projects do not need validated revenue to be GOOD, but they do need a clear user, clear use case, clear product boundary, realistic productization path, and plausible willingness to pay.',
    'For oneLinerZh, you are not an analyst. You are a one-line condenser that only compresses the real repository purpose.',
    'oneLinerZh must explicitly say who uses it and what they do with it.',
    'Never use vague phrases like 一个工具, 一个系统, 一个平台, 提效工具, 自动化解决方案.',
    'You must also produce businessJudgement, businessSignals, moneyDecision, and trainingHints.',
    'Use recent moneyLearning guidance to avoid repeating false-positive GOOD mistakes.',
    'If user preference signals are provided, use them as weak directional context: repeat success directions can break ties, repeated failure directions should make you more conservative.',
    'Return strict JSON only.',
  ].join(' ');
}

function buildSharedInstructions() {
  return [
    '判断优先级：',
    '1. 是否有真实用户',
    '2. 是否有明确使用场景',
    '3. 是否可以直接收费或有合理近端收费路径',
    '不满足以上三点：禁止 GOOD。',
    '',
    '项目类型规则：',
    '- model / infra / framework / sdk / demo / template 默认不能 GOOD。',
    '- 这些类型最多 OK + CLONE。',
    '- product / tool 只有在用户明确、场景明确、边界清楚、可产品化、可收费时才允许 GOOD + BUILD。',
    '',
    'GOOD 必须满足：',
    '- type in (product, tool)',
    '- hasRealUser = true',
    '- hasClearUseCase = true',
    '- hasProductizationPath = true',
    '- isDirectlyMonetizable = true 或存在合理近端收费路径',
    '- 不是 demo / infra / model / template',
    '',
    '对 developer tools / workflow tools / API tools 的特殊规则：',
    '- 不要因为“尚未证明收费”就默认 CLONE。',
    '- 只要开发者用户明确、工作流痛点明确、功能边界清楚、存在现实的产品化/收费路径，就可以 GOOD + BUILD。',
    '',
    'one-liner 规则：',
    '- 你的唯一任务是把项目压缩成绝对不跑偏的一句话描述，不负责重新判断价值，不负责编造用途。',
    '- 对 product / tool：格式强制接近「一个帮【明确用户】做【具体动作】的工具」。',
    '- 对 model：必须写成模型或模型框架，不能写成工具。',
    '- 对 infra / sdk / library：必须写成基础设施组件或开发组件，不能写成工具/平台/产品。',
    '- 对 demo / template：必须写成示例项目或模板项目。',
    '- 用户必须来自 README、项目描述、项目名称语义，禁止脑补团队和商业场景。',
    '- 动作必须是可执行行为：管理 / 监控 / 生成 / 审查 / 统计 / 签发 / 续期 / 记录。',
    '- 禁止：一个工具 / 一个系统 / 一个平台 / 自动化解决方案 / 提升效率 / 优化流程 / AI赋能。',
    '- 如果用户或场景不明确，必须降级成「一个用于……的示例项目/框架/模型框架/基础设施组件」。',
    '',
    '用户行为信号规则：',
    '- 如果给了 userSuccessPatterns / userFailurePatterns / preferredCategories / avoidedCategories / recentValidatedWins / recentDroppedReasons，把它们当成弱上下文，而不是绝对真理。',
    '- 如果给了 userSuccessReasons / userFailureReasons，把它们理解为用户最近做成/放弃项目的结构化原因：它们只能帮助你做保守修正，不能替代仓库证据。',
    '- 如果给了 minEvidenceThreshold / failureWeightDecay，把它们理解为用户长期记忆的稳定性约束：低证据和短期失败不能劫持你的判断。',
    '- failure patterns、avoidedCategories、recentDroppedReasons 只能让你更保守，不能把明显坏项目洗成好项目。',
    '- success patterns、preferredCategories、recentValidatedWins 只能在边界样本里轻微加权，不能覆盖 repo 本身的证据。',
    '',
    'Few-shot GOOD anchors:',
    '- 一个帮 AI 编码团队做代码 diff 审阅、审批交接和审计留痕的 review 工具。',
    '- 一个帮平台工程团队审批临时权限并自动回收访问的安全工作流工具。',
    '- 一个帮工程团队监控 API 质量、工作流失败和告警趋势的 SaaS 工具。',
    '',
    'Few-shot CLONE anchors:',
    '- 模型仓库、模型封装、模型 showcase。',
    '- infra framework、generic SDK、agent framework、router/proxy/provider capability layer。',
    '- demo、starter、template、boilerplate、tutorial、course project。',
    '',
    'Few-shot BAD anchors:',
    '- arbitrage、sniper、pump、passive income bait、scam-like repo。',
    '- 空壳、噪音、无真实用户和无使用场景项目。',
  ].join('\n');
}

function buildReviewSchemaShape() {
  return {
    oneLinerZh: '一个帮开发者自动生成 PR review 的工具',
    projectType: 'tool',
    hasRealUser: true,
    hasClearUseCase: true,
    hasProductizationPath: true,
    isDirectlyMonetizable: true,
    businessJudgement: {
      isFounderFit: true,
      isSmallTeamFriendly: true,
      hasNearTermMonetizationPath: true,
      moneyPriorityHint: 'HIGH_VALUE',
      moneyReasonZh:
        '它面向明确开发团队工作流，边界清楚，小团队可以较快做成可收费工具，更适合直接做而不是只抄思路。',
    },
    businessSignals: {
      targetUser: '使用 AI 编程和 PR 审查流程的开发团队',
      willingnessToPay: 'medium',
      monetizationModel: '可做团队订阅、托管协作版或审计增强版收费',
      urgency: 'high',
      founderFit: true,
      buildDifficulty: 'medium',
    },
    moneyDecision: 'BUILDABLE',
    verdict: 'GOOD',
    action: 'BUILD',
    reason: '开发团队用户明确，工作流痛点明确，产品边界清晰，具备现实产品化路径和合理付费可能性。',
    confidence: 0.84,
    whyNotProduct: null,
    reviewNotes: ['明确用户是开发团队', '工作流边界清晰', '有现实产品化路径'],
    trainingHints: {
      localModelMistakes: ['too_strict_on_early_monetization'],
      ruleSuggestions: ['对 developer workflow 工具不要要求已验证收费闭环'],
      promptSuggestions: ['先判断是否存在明确用户和工作流边界，再判断商业成熟度'],
      anchorSuggestions: ['补一个 developer review workflow 的 GOOD anchor'],
      shouldUpdateLocalHeuristics: true,
    },
    oneLinerMeta: {
      confidence: 0.92,
      riskFlags: [],
    },
  };
}

function buildSchemaHint(includeRepoId: boolean) {
  const core =
    '{"oneLinerZh":string,"projectType":"product"|"tool"|"model"|"infra"|"demo","hasRealUser":boolean,"hasClearUseCase":boolean,"hasProductizationPath":boolean,"isDirectlyMonetizable":boolean,"businessJudgement":{"isFounderFit":boolean,"isSmallTeamFriendly":boolean,"hasNearTermMonetizationPath":boolean,"moneyPriorityHint":"MUST_BUILD"|"HIGH_VALUE"|"CLONEABLE"|"LOW_VALUE"|"IGNORE","moneyReasonZh":string},"businessSignals":{"targetUser":string,"willingnessToPay":"high"|"medium"|"low","monetizationModel":string,"urgency":"high"|"medium"|"low","founderFit":boolean,"buildDifficulty":"low"|"medium"|"high"},"moneyDecision":"MUST_BUILD"|"BUILDABLE"|"CLONE_ONLY"|"NOT_WORTH","verdict":"GOOD"|"OK"|"BAD","action":"BUILD"|"CLONE"|"IGNORE","reason":string,"confidence":number,"whyNotProduct":string|null,"reviewNotes":string[],"trainingHints":{"localModelMistakes":string[],"ruleSuggestions":string[],"promptSuggestions":string[],"anchorSuggestions":string[],"shouldUpdateLocalHeuristics":boolean},"oneLinerMeta":{"confidence":number,"riskFlags":string[]}}';

  if (!includeRepoId) {
    return core;
  }

  return `{"repoId":string,"changed":boolean,${core.slice(1)}`;
}

export function buildClaudeProjectReviewPrompt(input: unknown) {
  return {
    promptVersion: CLAUDE_PROJECT_REVIEW_PROMPT_VERSION,
    systemPrompt: buildSystemPrompt(),
    prompt: [
      'Review this repository as a final high-precision startup-opportunity check.',
      buildSharedInstructions(),
      '',
      'Return JSON with exact shape:',
      stringifyInput(buildReviewSchemaShape()),
      '',
      'Repository review input:',
      stringifyInput(input),
    ].join('\n'),
    schemaHint: buildSchemaHint(false),
  };
}

export function buildClaudeProjectReviewBatchPrompt(
  inputs: Array<{
    repoId: string;
    input: unknown;
  }>,
) {
  return {
    promptVersion: CLAUDE_PROJECT_REVIEW_PROMPT_VERSION,
    systemPrompt: buildSystemPrompt(),
    prompt: [
      'Batch review these repositories as a final high-precision startup-opportunity check.',
      'Return a JSON array. Each item must correspond to one repoId from the input.',
      'If a repository does not need correction, still include it with changed=false and the corrected fields equal to your final judgement.',
      buildSharedInstructions(),
      '',
      'Return JSON array with exact item shape:',
      stringifyInput({
        repoId: 'repo_123',
        changed: true,
        ...buildReviewSchemaShape(),
      }),
      '',
      'Repositories to review:',
      stringifyInput(inputs),
    ].join('\n'),
    schemaHint: `[${buildSchemaHint(true)}]`,
  };
}

export { CLAUDE_PROJECT_REVIEW_PROMPT_VERSION };
