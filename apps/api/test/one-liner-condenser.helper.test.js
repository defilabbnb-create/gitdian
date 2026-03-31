const test = require('node:test');
const assert = require('node:assert/strict');

const {
  condenseRepositoryOneLiner,
} = require('../dist/modules/analysis/helpers/one-liner-condenser.helper');

test('builds a high-confidence product sentence only when user and action are clear', () => {
  const result = condenseRepositoryOneLiner({
    repository: {
      name: 'cert-cli',
      fullName: 'ops/cert-cli',
      description: 'CLI for issuing and renewing TLS certificates with DNS-01 automation',
      topics: ['cli', 'tls', 'dns-01'],
      readmeText:
        'A CLI for platform engineers to issue and renew TLS certificates with DNS-01 automation.',
    },
    projectType: 'tool',
    candidate: '一个帮运维团队自动签发 TLS 证书的工具',
    signals: {
      hasRealUser: true,
      hasClearUseCase: true,
      isDirectlyMonetizable: true,
      categoryMain: 'tools',
      categorySub: 'cli',
    },
  });

  assert.equal(result.confidence, 'high');
  assert.equal(result.oneLinerZh, '一个帮平台工程团队签发和续期 TLS 证书的 CLI 工具');
  assert.ok(result.reasoning.some((line) => line.includes('项目类型判断为 tool')));
  assert.deepEqual(result.riskFlags, []);
});

test('builds a medium-confidence technical sentence when user is only partially clear', () => {
  const result = condenseRepositoryOneLiner({
    repository: {
      name: 'api-log-mw',
      fullName: 'acme/api-log-mw',
      description: 'Middleware for API request logging and tracing',
      topics: ['middleware', 'logging'],
      readmeText:
        'Middleware that records API request logs for backend developers and service teams.',
    },
    projectType: 'tool',
    candidate: '一个平台',
    signals: {
      hasRealUser: false,
      hasClearUseCase: true,
      isDirectlyMonetizable: false,
      categoryMain: 'tools',
      categorySub: 'devtools',
    },
  });

  assert.equal(result.confidence, 'medium');
  assert.equal(
    result.oneLinerZh,
    '一个用于记录 API 调用日志的中间件，主要面向后端开发者',
  );
  assert.ok(result.reasoning.some((line) => line.includes('后端开发者')));
});

test('keeps infra projects on factual infrastructure wording', () => {
  const result = condenseRepositoryOneLiner({
    repository: {
      name: 'abnemo',
      fullName: 'abstratium-dev/abnemo',
      description: 'Linux egress monitoring and firewall rule generation',
      topics: ['infra', 'security'],
      readmeText:
        'Monitor Linux egress traffic and generate firewall rules for security teams.',
    },
    projectType: 'infra',
    candidate: '一个帮安全团队监控流量的工具',
    signals: {
      hasRealUser: true,
      hasClearUseCase: true,
      isDirectlyMonetizable: false,
      categoryMain: 'infra',
      categorySub: 'security',
    },
  });

  assert.equal(result.confidence, 'medium');
  assert.equal(
    result.oneLinerZh,
    '一个用于监控出站流量并生成防火墙规则的基础设施组件，主要面向安全团队',
  );
  assert.ok(result.riskFlags.includes('infra_mislabel'));
});

test('downgrades demo repositories to low-confidence example wording', () => {
  const result = condenseRepositoryOneLiner({
    repository: {
      name: 'starter-demo',
      fullName: 'demo/starter-demo',
      description: 'Starter template for AI workflow apps',
      topics: ['template', 'starter'],
      readmeText: 'A starter template and example project for AI workflow apps.',
    },
    projectType: 'demo',
    candidate: '一个帮团队快速搭建 AI 工作流的工具',
    signals: {
      hasRealUser: false,
      hasClearUseCase: false,
      isDirectlyMonetizable: false,
      categoryMain: 'other',
      categorySub: 'other',
    },
  });

  assert.equal(result.confidence, 'low');
  assert.equal(result.oneLinerZh, '一个围绕自动化流程的实现示例');
  assert.ok(result.riskFlags.includes('demo_mislabel'));
});

test('forces a generic low-confidence sentence when user and use case are unclear', () => {
  const result = condenseRepositoryOneLiner({
    repository: {
      name: 'mystery-app',
      fullName: 'demo/mystery-app',
      description: 'An app project',
      topics: ['app'],
      readmeText: 'WIP',
    },
    projectType: 'tool',
    candidate: '一个帮团队自动跑流程的工具',
    signals: {
      hasRealUser: false,
      hasClearUseCase: false,
      isDirectlyMonetizable: false,
      categoryMain: 'tools',
      categorySub: 'workflow',
    },
  });

  assert.equal(result.confidence, 'low');
  assert.equal(
    result.oneLinerZh,
    '这个项目当前更像一个技术实现或能力示例，具体用户和使用场景还不够清晰。',
  );
  assert.ok(result.riskFlags.includes('unclear_user'));
  assert.ok(result.riskFlags.includes('possible_overgeneralization'));
});

test('downgrades conflicting product narratives and marks conflict risk flags', () => {
  const result = condenseRepositoryOneLiner({
    repository: {
      name: 'vision-stack',
      fullName: 'lab/vision-stack',
      description: 'Vision-language model playground',
      topics: ['multimodal', 'vision'],
      readmeText:
        'Experimental vision-language model implementation with inference examples.',
    },
    projectType: 'tool',
    candidate: '一个帮团队自动完成图像工作流的平台',
    signals: {
      hasRealUser: false,
      hasClearUseCase: false,
      isDirectlyMonetizable: false,
      categoryMain: 'ai',
      categorySub: 'model',
      monetizationSummaryZh: '已有现实收费路径，但更像早期切口。',
    },
  });

  assert.equal(result.confidence, 'low');
  assert.equal(
    result.oneLinerZh,
    '这个项目当前更像一个技术实现或能力示例，具体用户和使用场景还不够清晰。',
  );
  assert.ok(result.riskFlags.includes('user_conflict'));
  assert.ok(result.riskFlags.includes('category_mismatch'));
  assert.ok(result.riskFlags.includes('monetization_overclaim'));
});

test('keeps a concrete snapshot-style fallback sentence when repo metadata is noisy', () => {
  const result = condenseRepositoryOneLiner({
    repository: {
      name: 'ap-csp-mastery',
      fullName: 'school/ap-csp-mastery',
      description: 'Mastery for AP CSP',
      topics: ['education'],
      readmeText:
        'Student practice system. Includes token usage example snippets and release notes, but the repo itself is a classroom quiz platform.',
    },
    projectType: 'tool',
    candidate: '',
    fallback:
      '面向 AP 计算机原理课程的师生，提供按主题解锁和进度追踪的在线测验练习平台',
    signals: {
      hasRealUser: true,
      hasClearUseCase: true,
      isDirectlyMonetizable: false,
      categoryMain: 'content',
      categorySub: 'content-creation',
    },
  });

  assert.equal(result.confidence, 'high');
  assert.equal(
    result.oneLinerZh,
    '面向 AP 计算机原理课程的师生，提供按主题解锁和进度追踪的在线测验练习平台',
  );
  assert.doesNotMatch(result.oneLinerZh, /token|成本明细|CLI 工具/);
});
