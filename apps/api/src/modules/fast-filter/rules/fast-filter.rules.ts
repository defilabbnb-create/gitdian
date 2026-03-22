import { Repository, RepositoryContent, RepositoryRoughLevel } from '@prisma/client';

export type FastFilterSignal = {
  score: number;
  reason: string;
};

export type FastFilterRuleResult = {
  toolLikeScore: number;
  roughPass: boolean;
  roughLevel: RepositoryRoughLevel;
  roughReason: string;
  reasons: string[];
};

type FastFilterInput = {
  repository: Repository;
  content: RepositoryContent | null;
  now: Date;
  config?: {
    staleDaysThreshold?: number;
    scoreThresholdA?: number;
    scoreThresholdB?: number;
  };
};

const NEGATIVE_KEYWORDS = [
  'demo',
  'tutorial',
  'boilerplate',
  'template',
  'awesome',
  'notes',
  'learning',
  'practice',
  'exercise',
];

const TOOL_KEYWORDS = [
  'tool',
  'workflow',
  'automation',
  'productivity',
  'cli',
  'agent',
  'sync',
  'pipeline',
  'monitor',
  'manage',
];

const WORKFLOW_KEYWORDS = [
  'input',
  'output',
  'step',
  'workflow',
  'pipeline',
  'automate',
  'process',
];

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getText(repository: Repository, content: RepositoryContent | null) {
  return [
    repository.name,
    repository.fullName,
    repository.description ?? '',
    content?.readmeText ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

function scoreNegativeSignals({ repository, content, now }: FastFilterInput) {
  const signals: FastFilterSignal[] = [];
  const combinedText = getText(repository, content);
  const readmeLength = (content?.readmeText ?? '').trim().length;
  const staleDaysThreshold = inputConfigStaleThreshold({
    repository,
    content,
    now,
  });

  if (repository.archived) {
    signals.push({ score: -35, reason: 'Repository is archived.' });
  }

  if (repository.disabled) {
    signals.push({ score: -35, reason: 'Repository is disabled.' });
  }

  if (!repository.description && readmeLength < 400) {
    signals.push({
      score: -22,
      reason: 'Description is empty and README is too short to explain the project clearly.',
    });
  }

  if (repository.pushedAtGithub) {
    const staleDays =
      (now.getTime() - repository.pushedAtGithub.getTime()) / (1000 * 60 * 60 * 24);

    if (staleDays > staleDaysThreshold) {
      signals.push({
        score: -20,
        reason: `Repository has not been updated for more than ${staleDaysThreshold} days.`,
      });
    } else if (staleDays > Math.max(30, Math.round(staleDaysThreshold / 2))) {
      signals.push({
        score: -8,
        reason: 'Repository activity looks somewhat stale.',
      });
    }
  }

  const matchedNegativeKeywords = NEGATIVE_KEYWORDS.filter((keyword) =>
    combinedText.includes(keyword),
  );

  if (matchedNegativeKeywords.length > 0) {
    signals.push({
      score: -18,
      reason: `Repository looks like a non-productized project (${matchedNegativeKeywords.slice(0, 3).join(', ')}).`,
    });
  }

  return signals;
}

function scoreQualitySignals({ repository, content }: FastFilterInput) {
  const signals: FastFilterSignal[] = [];
  const readmeLength = (content?.readmeText ?? '').trim().length;
  const combinedText = getText(repository, content);

  if (repository.description && repository.description.trim().length >= 24) {
    signals.push({
      score: 12,
      reason: 'Description provides meaningful context about the problem being solved.',
    });
  }

  if (readmeLength >= 1200) {
    signals.push({ score: 16, reason: 'README is fairly complete.' });
  } else if (readmeLength >= 600) {
    signals.push({ score: 10, reason: 'README has useful depth.' });
  } else if (readmeLength >= 250) {
    signals.push({ score: 5, reason: 'README provides some basic guidance.' });
  }

  const workflowHits = WORKFLOW_KEYWORDS.filter((keyword) =>
    combinedText.includes(keyword),
  );
  if (workflowHits.length >= 2) {
    signals.push({
      score: 10,
      reason: 'README/description suggests a clear workflow or operational flow.',
    });
  }

  return signals;
}

function scoreToolingSignals({ repository, content }: FastFilterInput) {
  const signals: FastFilterSignal[] = [];
  const combinedText = getText(repository, content);
  const toolHits = TOOL_KEYWORDS.filter((keyword) => combinedText.includes(keyword));

  if (toolHits.length >= 2) {
    signals.push({
      score: 16,
      reason: 'Project language suggests tool, automation, or workflow value.',
    });
  } else if (toolHits.length === 1) {
    signals.push({
      score: 8,
      reason: 'Project shows some tool-like or automation-oriented characteristics.',
    });
  }

  if (content?.hasDockerfile) {
    signals.push({ score: 5, reason: 'Has Dockerfile.' });
  }
  if (content?.hasCompose) {
    signals.push({ score: 4, reason: 'Has docker compose support.' });
  }
  if (content?.hasCi) {
    signals.push({ score: 5, reason: 'Has CI setup.' });
  }
  if (content?.hasTests) {
    signals.push({ score: 7, reason: 'Has tests.' });
  }
  if (content?.hasDocs) {
    signals.push({ score: 5, reason: 'Has docs.' });
  }
  if (content?.hasEnvExample) {
    signals.push({ score: 4, reason: 'Has environment example.' });
  }

  return signals;
}

function scoreFreshnessSignals({ repository, now }: FastFilterInput) {
  const signals: FastFilterSignal[] = [];

  if (!repository.pushedAtGithub) {
    return signals;
  }

  const activeDays =
    (now.getTime() - repository.pushedAtGithub.getTime()) / (1000 * 60 * 60 * 24);

  if (activeDays <= 30) {
    signals.push({ score: 12, reason: 'Repository is actively updated in the last 30 days.' });
  } else if (activeDays <= 90) {
    signals.push({ score: 6, reason: 'Repository has seen relatively recent updates.' });
  }

  return signals;
}

export function evaluateFastFilterByRules(input: FastFilterInput): FastFilterRuleResult {
  const groups = [
    ...scoreNegativeSignals(input),
    ...scoreQualitySignals(input),
    ...scoreToolingSignals(input),
    ...scoreFreshnessSignals(input),
  ];

  const totalScore = clampScore(50 + groups.reduce((sum, item) => sum + item.score, 0));
  const reasons = groups
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .map((item) => item.reason);

  let roughLevel: RepositoryRoughLevel = RepositoryRoughLevel.C;
  let roughPass = false;

  const hasSevereNegative = groups.some((item) => item.score <= -30);

  const scoreThresholdA = input.config?.scoreThresholdA ?? 75;
  const scoreThresholdB = input.config?.scoreThresholdB ?? 55;

  if (!hasSevereNegative && totalScore >= scoreThresholdA) {
    roughLevel = RepositoryRoughLevel.A;
    roughPass = true;
  } else if (!hasSevereNegative && totalScore >= scoreThresholdB) {
    roughLevel = RepositoryRoughLevel.B;
    roughPass = true;
  } else {
    roughLevel = RepositoryRoughLevel.C;
    roughPass = false;
  }

  const roughReason =
    reasons.slice(0, 4).join(' ') ||
    'Insufficient repository signals were available for a stronger rule-based decision.';

  return {
    toolLikeScore: totalScore,
    roughPass,
    roughLevel,
    roughReason,
    reasons,
  };
}

function inputConfigStaleThreshold(input: FastFilterInput) {
  return input.config?.staleDaysThreshold ?? 180;
}
