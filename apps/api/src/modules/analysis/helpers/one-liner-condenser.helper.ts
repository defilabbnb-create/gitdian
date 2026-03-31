export type OneLinerProjectType =
  | 'product'
  | 'tool'
  | 'model'
  | 'infra'
  | 'demo';

export type OneLinerConfidenceLevel = 'high' | 'medium' | 'low';

export type OneLinerRiskFlag =
  | 'possible_overgeneralization'
  | 'unclear_user'
  | 'unclear_action'
  | 'unclear_use_case'
  | 'infra_mislabel'
  | 'model_mislabel'
  | 'demo_mislabel'
  | 'user_conflict'
  | 'category_mismatch'
  | 'monetization_overclaim'
  | 'english_leak'
  | 'repo_name_fallback'
  | 'weak_readme';

export type OneLinerCondenserInput = {
  repository: {
    name: string;
    fullName: string;
    description: string | null;
    topics: string[];
    readmeText?: string | null;
  };
  projectType: OneLinerProjectType;
  candidate: string | null;
  fallback?: string | null;
  signals?: {
    hasRealUser?: boolean;
    hasClearUseCase?: boolean;
    isDirectlyMonetizable?: boolean;
    categoryMain?: string | null;
    categorySub?: string | null;
    monetizationSummaryZh?: string | null;
  };
};

export type OneLinerCondenserResult = {
  oneLinerZh: string;
  confidence: OneLinerConfidenceLevel;
  confidenceScore: number;
  reasoning: string[];
  riskFlags: OneLinerRiskFlag[];
};

type DerivedFacts = {
  explicitUser: string | null;
  likelyUser: string | null;
  concreteAction: string | null;
  artifactType: string;
  direction: string;
  weakReadme: boolean;
  hasRealUser: boolean;
  hasClearUseCase: boolean;
  isDirectlyMonetizable: boolean;
};

const LOW_CONFIDENCE_GENERIC_LINE =
  '这个项目当前更像一个技术实现或能力示例，具体用户和使用场景还不够清晰。';

const PRODUCT_TYPES_RE = /(工具|平台|系统|服务|产品)/;
const EXPLICIT_PRODUCT_NARRATIVE_RE =
  /一个帮.+的(?:工具|平台|系统|服务|产品)|一个用于.+的(?:工具|平台|系统|服务|产品).*(主要面向|面向)/;
const PRODUCT_SENTENCE_RE = /^一个帮.+做.+的(?:CLI 工具|浏览器扩展|API 服务|中间件|开发库|工具|服务)$/;
const MEDIUM_SENTENCE_RE =
  /^一个用于.+的(?:CLI 工具|浏览器扩展|API 服务|中间件|开发库|工具|代码项目|基础设施组件|模型实现)(?:，主要面向.+)?$/;
const LOW_SENTENCE_RE =
  /^(一个围绕.+的(?:实现示例|模型实现|基础设施实现)|一个用于.+的代码项目|当前更像.+|这个项目当前更像.+)$/;
const GENERIC_RE =
  /(一个工具|一个系统|一个平台|一个项目|自动化工具|自动化解决方案|提升效率|优化流程|AI赋能|帮团队自动跑流程|帮用户快速搭应用|在命令行里提效)/i;
const ENGLISH_HEAVY_RE = /^(?=.*[A-Za-z])(?!(?:.*[\u4e00-\u9fff].*){2}).{12,}$/;
const HALF_ENGLISH_RE =
  /[A-Za-z]{4,}(?:\s+[A-Za-z0-9/_-]{2,}){1,}|\bREADME\b|\bworkflow\b|\bplatform\b|\btool\b/i;
const REPO_NAME_FALLBACK_RE =
  /一个名为.+的项目|围绕.+repo|围绕.+仓库|围绕.+项目名称|围绕 .+ 场景的小工具/i;
const STRONG_MONETIZATION_RE =
  /(可从团队订阅、托管版或企业版收费|已有现实收费路径|企业版收费|团队订阅|托管版收费|现实收费路径)/;

function cleanText(value: unknown, maxLength = 160) {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[。]+$/g, '')
    .trim();

  if (!normalized) {
    return '';
  }

  return normalized.slice(0, maxLength);
}

function buildHaystack(input: OneLinerCondenserInput) {
  const readmePreview = cleanText(input.repository.readmeText, 900);
  return [
    input.repository.name,
    input.repository.fullName,
    input.repository.description,
    ...(input.repository.topics ?? []),
    input.candidate ?? '',
    input.fallback ?? '',
    readmePreview,
  ]
    .map((item) => String(item ?? '').toLowerCase())
    .join('\n');
}

function buildActionEvidenceSources(input: OneLinerCondenserInput) {
  return {
    core: [
      cleanText(input.repository.name, 120),
      cleanText(input.repository.fullName, 160),
      cleanText(input.repository.description, 240),
      cleanText((input.repository.topics ?? []).join(' '), 240),
    ]
      .map((item) => item.toLowerCase())
      .filter(Boolean),
    support: [
      cleanText(input.candidate, 220),
      cleanText(input.fallback, 220),
      cleanText(input.repository.readmeText, 900),
    ]
      .map((item) => item.toLowerCase())
      .filter(Boolean),
  };
}

function countPatternHits(pattern: RegExp, values: string[]) {
  let count = 0;

  for (const value of values) {
    if (value && pattern.test(value)) {
      count += 1;
    }
  }

  return count;
}

function hasStrongSensitiveActionEvidence(
  input: OneLinerCondenserInput,
  pattern: RegExp,
) {
  const sources = buildActionEvidenceSources(input);
  const coreHits = countPatternHits(pattern, sources.core);

  if (coreHits > 0) {
    return true;
  }

  return coreHits + countPatternHits(pattern, sources.support) >= 2;
}

function resolveExplicitUser(haystack: string) {
  const userRules: Array<[RegExp, string]> = [
    [/(platform engineering|platform engineers|平台工程)/i, '平台工程团队'],
    [/(devops team|devops engineers|运维团队)/i, '运维团队'],
    [/(security team|security engineers|安全团队)/i, '安全团队'],
    [/(frontend developers?|前端开发者)/i, '前端开发者'],
    [/(backend developers?|后端开发者)/i, '后端开发者'],
    [/(engineering team|工程团队)/i, '工程团队'],
    [/(developer team|开发团队)/i, '开发团队'],
    [/(developers?|开发者)/i, '开发者'],
    [/(engineers?|工程师)/i, '工程师'],
    [/(operators?|运维人员)/i, '运维人员'],
    [/(site owners?|webmasters?|站长)/i, '内容站长'],
    [/(video editors?|视频剪辑师)/i, '视频剪辑师'],
    [/(designers?|设计师)/i, '设计师'],
    [/(job seekers?|求职者)/i, '求职者'],
    [/(lawyers?|律师|法务)/i, '律师团队'],
    [/(product managers?|产品经理)/i, '产品团队'],
    [/(students?|teachers?|classroom|course staff|师生|学生|教师)/i, '师生'],
    [/(terminal users?|end users?|终端用户)/i, '终端用户'],
  ];

  for (const [pattern, label] of userRules) {
    if (pattern.test(haystack)) {
      return label;
    }
  }

  return null;
}

function resolveLikelyUser(
  haystack: string,
  explicitUser: string | null,
) {
  if (explicitUser) {
    return explicitUser;
  }

  if (/(cli|sdk|library|middleware|developer tool|devtool|terminal)/i.test(haystack)) {
    return '开发者';
  }

  return null;
}

function resolveConcreteAction(
  input: OneLinerCondenserInput,
  haystack: string,
  projectType: OneLinerProjectType,
) {
  const actionRules: Array<{
    pattern: RegExp;
    action: string;
    requiresStrongEvidence?: boolean;
  }> = [
    {
      pattern: /(spotify web api|playlist|recommend)/i,
      action: '在命令行里搜索歌曲并管理播放列表',
      requiresStrongEvidence: true,
    },
    { pattern: /(certificate|tls|dns-01|签发|续期)/i, action: '签发和续期 TLS 证书' },
    {
      pattern:
        /(secret manager|secrets management|dotenv|environment variables?|env vars?|密钥管理|环境变量)/i,
      action: '管理环境变量和密钥',
      requiresStrongEvidence: true,
    },
    {
      pattern:
        /(token (usage|cost)|usage (tracking|dashboard)|cost (tracking|dashboard|observability)|api cost|token 成本|token 用量|成本明细|计费)/i,
      action: '记录 token 与成本明细',
      requiresStrongEvidence: true,
    },
    { pattern: /(api call log|api request log|request log|调用日志|请求日志)/i, action: '记录 API 调用日志' },
    { pattern: /(review comment|pull request|pr review|diff|审阅|审查)/i, action: '审阅代码 diff 和变更说明' },
    { pattern: /(approval|audit|审批|审计链)/i, action: '发起审批并记录审计链路' },
    { pattern: /(kubectl exec|临时访问|access request|回收权限)/i, action: '审批临时访问并自动回收权限' },
    { pattern: /(egress|出站流量|firewall|防火墙规则)/i, action: '监控出站流量并生成防火墙规则' },
    { pattern: /(visitor|地理分布|访客地图)/i, action: '查看实时访客地理分布' },
    { pattern: /(resume|ats|简历)/i, action: '改写简历并生成 ATS 匹配评分' },
    { pattern: /(green screen|绿幕|抠像|keying|matte)/i, action: '分离绿幕素材的前景与边缘' },
    { pattern: /(clipboard|剪贴板)/i, action: '记录剪贴板历史并快速粘贴' },
    { pattern: /(react component|component style|组件样式)/i, action: '预览和编辑 React 组件样式' },
    { pattern: /(docker sandbox|沙箱)/i, action: '把终端命令隔离到 Docker 沙箱里执行' },
    { pattern: /(claims|billing|理赔|账单)/i, action: '审核理赔账单并标记异常' },
    { pattern: /(search api|serp|retrieval|检索接口)/i, action: '提供搜索与检索接口' },
    { pattern: /(scrap|crawl|extract data|网页采集)/i, action: '采集网页与结构化数据' },
    {
      pattern:
        /(deployment pipeline|deploy pipeline|release pipeline|release management|deploy orchestration|application delivery|app delivery|发布流水线|交付流程)/i,
      action: '部署和交付应用',
    },
    { pattern: /(auth|authentication|login|sso|identity)/i, action: '接入登录与权限能力' },
    { pattern: /(observability|monitoring dashboard|monitoring stack|alert routing|系统监控|运行指标|告警)/i, action: '监控系统运行状态' },
    { pattern: /(workflow|automation|orchestration|zapier|n8n)/i, action: '串联和执行多步流程' },
    { pattern: /(memory|context window|long-term memory|上下文|记忆)/i, action: '管理长期上下文与记忆' },
  ];

  for (const rule of actionRules) {
    if (!rule.pattern.test(haystack)) {
      continue;
    }

    if (
      rule.requiresStrongEvidence &&
      !hasStrongSensitiveActionEvidence(input, rule.pattern)
    ) {
      continue;
    }

    return rule.action;
  }

  if (projectType === 'demo') {
    return '展示相关技术能力';
  }

  if (projectType === 'model') {
    return '执行特定模型任务';
  }

  if (projectType === 'infra') {
    return '支撑底层开发与运行流程';
  }

  return null;
}

function resolveArtifactType(haystack: string, projectType: OneLinerProjectType) {
  if (projectType === 'demo') {
    return '示例项目';
  }

  if (projectType === 'model') {
    return '模型实现';
  }

  if (projectType === 'infra') {
    return '基础设施组件';
  }

  if (/(browser extension|chrome extension|firefox extension)/i.test(haystack)) {
    return '浏览器扩展';
  }

  if (/(cli|terminal|command line)/i.test(haystack)) {
    return 'CLI 工具';
  }

  if (/(middleware|中间件)/i.test(haystack)) {
    return '中间件';
  }

  if (/(sdk|library|开发库|组件库)/i.test(haystack)) {
    return '开发库';
  }

  if (/(api service|api server|http api|search api|开放接口)/i.test(haystack)) {
    return 'API 服务';
  }

  return '工具';
}

function resolveDirection(
  haystack: string,
  input: OneLinerCondenserInput,
  facts: Pick<DerivedFacts, 'concreteAction'>,
) {
  const categorySub = cleanText(input.signals?.categorySub, 40).toLowerCase();
  const categoryMain = cleanText(input.signals?.categoryMain, 40).toLowerCase();

  if (/(multimodal|vision-language|vlm|图像|视觉|多模态)/i.test(haystack)) {
    return '多模态处理';
  }

  if (/(search api|retrieval|rag|embedding|检索)/i.test(haystack)) {
    return '搜索与检索';
  }

  if (/(workflow|automation|orchestration|zapier|n8n)/i.test(haystack)) {
    return '自动化流程';
  }

  if (/(cli|terminal|command line)/i.test(haystack)) {
    return '命令行工作流';
  }

  if (/(auth|login|sso|identity)/i.test(haystack)) {
    return '登录与权限';
  }

  if (/(deploy|deployment|release|delivery|devops|kubernetes|docker)/i.test(haystack)) {
    return '部署与交付';
  }

  if (/(observability|monitor|alert|日志|log)/i.test(haystack)) {
    return '可观测与日志记录';
  }

  if (/(dataset|etl|pipeline|analytics|scraping|采集|数据)/i.test(haystack)) {
    return '数据处理';
  }

  if (categorySub) {
    const mapped: Record<string, string> = {
      automation: '自动化流程',
      workflow: '工作流编排',
      cli: '命令行工作流',
      devtools: '开发流程',
      'ai-tools': 'AI 使用场景',
      'ai-agent': 'AI agent 编排',
      'ai-code': 'AI 编码',
      'ai-search': '搜索与检索',
      'data-tools': '数据处理',
      analytics: '数据分析',
      scraping: '网页数据采集',
      etl: '数据处理',
      auth: '登录与权限',
      deployment: '部署与交付',
      observability: '可观测与监控',
      monitoring: '监控能力',
      security: '安全能力',
      'app-builder': '应用搭建',
      'browser-extension': '浏览器扩展能力',
    };

    if (mapped[categorySub]) {
      return mapped[categorySub];
    }
  }

  if (categoryMain === 'infra') {
    return '基础设施能力';
  }

  if (facts.concreteAction) {
    return facts.concreteAction.replace(/^执行|支撑|提供/, '');
  }

  return '当前技术方向';
}

function hasWeakReadme(input: OneLinerCondenserInput) {
  const readmeLength = cleanText(input.repository.readmeText, 2000).length;
  const descriptionLength = cleanText(input.repository.description, 400).length;
  const topicCount = Array.isArray(input.repository.topics) ? input.repository.topics.length : 0;

  return readmeLength < 80 && descriptionLength < 40 && topicCount < 3;
}

function looksEnglishOrHalfEnglish(line: string) {
  const normalized = cleanText(line, 160);
  if (!normalized) {
    return false;
  }

  if (!/[\u4e00-\u9fff]/.test(normalized)) {
    return ENGLISH_HEAVY_RE.test(normalized);
  }

  return HALF_ENGLISH_RE.test(normalized) && !/^一个/.test(normalized);
}

function looksRepoNameFallback(line: string, repository: OneLinerCondenserInput['repository']) {
  const normalized = cleanText(line, 160).toLowerCase();
  const name = cleanText(repository.name, 80).toLowerCase();
  const fullName = cleanText(repository.fullName, 160).toLowerCase();

  return (
    REPO_NAME_FALLBACK_RE.test(line) ||
    (!!name && normalized.includes(name) && /项目|仓库/.test(normalized)) ||
    (!!fullName && normalized.includes(fullName))
  );
}

function hasExplicitUserInLine(line: string) {
  return /(开发者|工程师|团队|运维|管理员|求职者|站长|剪辑师|设计师|律师|产品团队|师生|学生|教师|终端用户)/.test(
    line,
  );
}

function hasConcreteActionInLine(line: string) {
  return /(管理|监控|生成|审阅|记录|签发|续期|发起|查看|追踪|改写|分离|审批|回收|编辑|处理|部署|采集|提供|接入|串联|执行|支撑)/.test(
    line,
  );
}

function looksSpecificNarrativeSentence(line: string) {
  const normalized = cleanText(line, 180);

  if (!normalized || GENERIC_RE.test(normalized) || looksEnglishOrHalfEnglish(normalized)) {
    return false;
  }

  return (
    /^(面向|为|帮助|支持|供).+/u.test(normalized) ||
    /.+(?:提供|支持).+(?:工具|平台|系统|服务|扩展|客户端|后端|应用|项目)$/u.test(
      normalized,
    ) ||
    /.+(?:练习平台|命令启动器|测验平台|浏览器扩展|工作台|后台系统|后端系统)$/u.test(
      normalized,
    )
  );
}

function buildDerivedFacts(input: OneLinerCondenserInput): DerivedFacts {
  const haystack = buildHaystack(input);
  const explicitUser = resolveExplicitUser(haystack);
  const likelyUser = resolveLikelyUser(haystack, explicitUser);
  const concreteAction = resolveConcreteAction(input, haystack, input.projectType);
  const artifactType = resolveArtifactType(haystack, input.projectType);
  const direction = resolveDirection(haystack, input, {
    concreteAction,
  });

  return {
    explicitUser,
    likelyUser,
    concreteAction,
    artifactType,
    direction,
    weakReadme: hasWeakReadme(input),
    hasRealUser: Boolean(input.signals?.hasRealUser),
    hasClearUseCase: Boolean(input.signals?.hasClearUseCase),
    isDirectlyMonetizable: Boolean(input.signals?.isDirectlyMonetizable),
  };
}

function buildReasoning(
  input: OneLinerCondenserInput,
  facts: DerivedFacts,
  mode: OneLinerConfidenceLevel,
) {
  const reasoning: string[] = [];

  reasoning.push(`项目类型判断为 ${input.projectType}。`);

  if (facts.explicitUser) {
    reasoning.push(`已识别目标用户：${facts.explicitUser}。`);
  } else if (facts.likelyUser) {
    reasoning.push(`可能面向 ${facts.likelyUser}，但用户定义还不够完整。`);
  } else {
    reasoning.push('暂时没有看到足够明确的目标用户。');
  }

  if (facts.concreteAction) {
    reasoning.push(`已识别主要能力：${facts.concreteAction}。`);
  } else {
    reasoning.push('当前还缺少足够明确的使用场景或动作描述。');
  }

  if (facts.weakReadme) {
    reasoning.push('README 和描述信息偏薄，优先保守表达。');
  }

  if (!facts.isDirectlyMonetizable) {
    reasoning.push('没有看到足够明确的商业化证据。');
  }

  if (mode === 'low') {
    reasoning.push('当前更适合把它当成技术实现或能力样本来描述。');
  }

  return reasoning.slice(0, 4);
}

function formatArtifactType(artifactType: string) {
  return /^[A-Za-z]/.test(artifactType) ? ` ${artifactType}` : artifactType;
}

function buildHighConfidenceLine(facts: DerivedFacts) {
  if (!facts.explicitUser || !facts.concreteAction) {
    return '';
  }

  return `一个帮${facts.explicitUser}${facts.concreteAction}的${formatArtifactType(facts.artifactType)}`;
}

function buildMediumConfidenceLine(facts: DerivedFacts) {
  if (!facts.concreteAction) {
    return '';
  }

  if (facts.likelyUser) {
    return `一个用于${facts.concreteAction}的${formatArtifactType(facts.artifactType)}，主要面向${facts.likelyUser}`;
  }

  return `一个用于${facts.concreteAction}的${formatArtifactType(facts.artifactType)}`;
}

function buildLowConfidenceLine(
  input: OneLinerCondenserInput,
  facts: DerivedFacts,
  forceGeneric = false,
) {
  if (forceGeneric && (input.projectType === 'product' || input.projectType === 'tool')) {
    return LOW_CONFIDENCE_GENERIC_LINE;
  }

  if (input.projectType === 'demo') {
    return `一个围绕${facts.direction}的实现示例`;
  }

  if (input.projectType === 'model') {
    return `一个围绕${facts.direction}的模型实现，当前更像能力验证样本`;
  }

  if (input.projectType === 'infra') {
    return `一个围绕${facts.direction}的基础设施实现，当前更像能力层`;
  }

  if (facts.concreteAction) {
    return `一个用于${facts.concreteAction}的代码项目`;
  }

  return LOW_CONFIDENCE_GENERIC_LINE;
}

function isAcceptedCandidate(
  line: string,
  projectType: OneLinerProjectType,
  facts: DerivedFacts,
) {
  if (!line || GENERIC_RE.test(line) || looksEnglishOrHalfEnglish(line)) {
    return false;
  }

  if (projectType === 'product' || projectType === 'tool') {
    if (PRODUCT_SENTENCE_RE.test(line)) {
      return Boolean(
        facts.hasRealUser &&
          facts.hasClearUseCase &&
          hasExplicitUserInLine(line) &&
          hasConcreteActionInLine(line),
      );
    }

    if (MEDIUM_SENTENCE_RE.test(line) && hasConcreteActionInLine(line)) {
      return true;
    }

    return (
      looksSpecificNarrativeSentence(line) &&
      (facts.hasClearUseCase ||
        hasConcreteActionInLine(line) ||
        hasExplicitUserInLine(line))
    );
  }

  return LOW_SENTENCE_RE.test(line) || MEDIUM_SENTENCE_RE.test(line);
}

function detectRiskFlags(
  input: OneLinerCondenserInput,
  facts: DerivedFacts,
  line: string,
  sourceCandidate: string,
  sourceFallback: string,
) {
  const riskFlags: OneLinerRiskFlag[] = [];
  const lineToCheck = cleanText(line, 160);
  const sourceToCheck = `${sourceCandidate} ${sourceFallback}`;
  const categoryLabel = `${cleanText(input.signals?.categoryMain, 24)} ${cleanText(
    input.signals?.categorySub,
    24,
  )}`.trim();
  const monetizationSummary = cleanText(input.signals?.monetizationSummaryZh, 200);

  if (facts.weakReadme) {
    riskFlags.push('weak_readme');
  }

  if (!facts.hasRealUser && !facts.likelyUser) {
    riskFlags.push('unclear_user');
  }

  if (!facts.hasClearUseCase) {
    riskFlags.push('unclear_use_case');
  }

  if (!facts.concreteAction || !hasConcreteActionInLine(lineToCheck)) {
    riskFlags.push('unclear_action');
  }

  if (GENERIC_RE.test(lineToCheck) || GENERIC_RE.test(sourceCandidate) || GENERIC_RE.test(sourceFallback)) {
    riskFlags.push('possible_overgeneralization');
  }

  if (looksEnglishOrHalfEnglish(lineToCheck) || looksEnglishOrHalfEnglish(sourceCandidate)) {
    riskFlags.push('english_leak');
  }

  if (looksRepoNameFallback(lineToCheck, input.repository)) {
    riskFlags.push('repo_name_fallback');
  }

  if ((input.projectType === 'product' || input.projectType === 'tool') && !facts.hasRealUser) {
    if (
      EXPLICIT_PRODUCT_NARRATIVE_RE.test(lineToCheck) ||
      EXPLICIT_PRODUCT_NARRATIVE_RE.test(sourceCandidate)
    ) {
      riskFlags.push('user_conflict');
    }
  }

  if (
    (input.projectType === 'model' || input.projectType === 'infra' || input.projectType === 'demo') &&
    (PRODUCT_TYPES_RE.test(lineToCheck) || PRODUCT_TYPES_RE.test(sourceToCheck))
  ) {
    riskFlags.push('category_mismatch');
  }

  if (
    /模型|基础设施|待分类|model|infra|unknown/.test(categoryLabel) &&
    (PRODUCT_TYPES_RE.test(lineToCheck) || PRODUCT_TYPES_RE.test(sourceToCheck))
  ) {
    riskFlags.push('category_mismatch');
  }

  if (
    STRONG_MONETIZATION_RE.test(monetizationSummary) &&
    (!facts.hasRealUser || !facts.hasClearUseCase)
  ) {
    riskFlags.push('monetization_overclaim');
  }

  if (input.projectType === 'infra' && (PRODUCT_TYPES_RE.test(lineToCheck) || PRODUCT_TYPES_RE.test(sourceToCheck))) {
    riskFlags.push('infra_mislabel');
  }

  if (input.projectType === 'model' && (PRODUCT_TYPES_RE.test(lineToCheck) || PRODUCT_TYPES_RE.test(sourceToCheck))) {
    riskFlags.push('model_mislabel');
  }

  if (
    input.projectType === 'demo' &&
    (!/示例项目|实现示例/.test(lineToCheck) ||
      PRODUCT_TYPES_RE.test(sourceToCheck))
  ) {
    riskFlags.push('demo_mislabel');
  }

  return Array.from(new Set(riskFlags));
}

function confidenceScore(level: OneLinerConfidenceLevel) {
  switch (level) {
    case 'high':
      return 0.92;
    case 'medium':
      return 0.68;
    case 'low':
    default:
      return 0.38;
  }
}

export function condenseRepositoryOneLiner(
  input: OneLinerCondenserInput,
): OneLinerCondenserResult {
  const facts = buildDerivedFacts(input);
  const candidate = cleanText(input.candidate, 160);
  const fallback = cleanText(input.fallback, 160);
  const acceptedCandidate = isAcceptedCandidate(candidate, input.projectType, facts)
    ? candidate
    : '';
  const acceptedFallback = isAcceptedCandidate(fallback, input.projectType, facts)
    ? fallback
    : '';
  const acceptedFallbackLooksSpecific =
    Boolean(acceptedFallback) &&
    looksSpecificNarrativeSentence(acceptedFallback) &&
    hasExplicitUserInLine(acceptedFallback) &&
    hasConcreteActionInLine(acceptedFallback);

  let mode: OneLinerConfidenceLevel = 'low';
  let oneLinerZh = '';

  const canUseHighConfidenceProductSentence =
    (input.projectType === 'product' || input.projectType === 'tool') &&
    facts.hasRealUser &&
    facts.hasClearUseCase &&
    (acceptedFallbackLooksSpecific ||
      (Boolean(facts.explicitUser) && Boolean(facts.concreteAction))) &&
    !facts.weakReadme;

  const canUseMediumConfidenceSentence =
    Boolean(facts.concreteAction) &&
    Boolean(facts.likelyUser) &&
    !facts.weakReadme &&
    (facts.hasClearUseCase || Boolean(facts.explicitUser));

  if (canUseHighConfidenceProductSentence) {
    mode = 'high';
    oneLinerZh = acceptedCandidate || acceptedFallback || buildHighConfidenceLine(facts);
  } else if (
    input.projectType === 'infra' &&
    facts.concreteAction &&
    facts.likelyUser &&
    (facts.hasClearUseCase || Boolean(facts.explicitUser))
  ) {
    mode = 'medium';
    oneLinerZh = acceptedCandidate || acceptedFallback || buildMediumConfidenceLine(facts);
  } else if (
    (input.projectType === 'product' || input.projectType === 'tool') &&
    canUseMediumConfidenceSentence &&
    facts.hasClearUseCase
  ) {
    mode = 'medium';
    oneLinerZh = acceptedCandidate || acceptedFallback || buildMediumConfidenceLine(facts);
  } else {
    mode = 'low';
    oneLinerZh = acceptedCandidate || acceptedFallback || buildLowConfidenceLine(input, facts);
  }

  let riskFlags = detectRiskFlags(input, facts, oneLinerZh, candidate, fallback);
  const hasConflict =
    riskFlags.includes('user_conflict') ||
    riskFlags.includes('monetization_overclaim') ||
    ((input.projectType === 'product' || input.projectType === 'tool') &&
      riskFlags.includes('category_mismatch'));
  const mustForceGenericDowngrade =
    hasConflict ||
    looksEnglishOrHalfEnglish(oneLinerZh) ||
    looksRepoNameFallback(oneLinerZh, input.repository) ||
    ((input.projectType === 'product' || input.projectType === 'tool') &&
      (!facts.hasClearUseCase || (!facts.hasRealUser && !facts.likelyUser)));

  if (mustForceGenericDowngrade) {
    mode = 'low';
    oneLinerZh = buildLowConfidenceLine(input, facts, true);
    riskFlags = detectRiskFlags(input, facts, oneLinerZh, candidate, fallback);
  }

  const reasoning = buildReasoning(input, facts, mode);

  return {
    oneLinerZh,
    confidence: mode,
    confidenceScore: confidenceScore(mode),
    reasoning,
    riskFlags,
  };
}
