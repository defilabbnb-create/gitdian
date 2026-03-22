import { Prisma } from '@prisma/client';

type RepositoryWithContext = Prisma.RepositoryGetPayload<{
  include: {
    content: true;
    analysis: true;
  };
}>;

function truncateText(value: string | null | undefined, maxLength: number) {
  if (!value) {
    return '';
  }

  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}\n...[truncated]`;
}

function normalizeJsonArray(value: Prisma.JsonValue | null | undefined): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : [];
}

function prioritizeFileTreeEntries(entries: Array<Record<string, unknown>>) {
  const importantPrefixes = [
    'src',
    'app',
    'docs',
    'tests',
    'test',
    '.github',
    'packages',
    'api',
    'web',
    'plugins',
  ];

  return [...entries].sort((left, right) => {
    const leftPath = String(left.path ?? left.name ?? '');
    const rightPath = String(right.path ?? right.name ?? '');

    const leftImportant = importantPrefixes.some(
      (prefix) => leftPath === prefix || leftPath.startsWith(`${prefix}/`),
    );
    const rightImportant = importantPrefixes.some(
      (prefix) => rightPath === prefix || rightPath.startsWith(`${prefix}/`),
    );

    if (leftImportant === rightImportant) {
      return leftPath.localeCompare(rightPath);
    }

    return leftImportant ? -1 : 1;
  });
}

export function buildIdeaExtractPromptInput(repository: RepositoryWithContext) {
  const fileTreeEntries = normalizeJsonArray(repository.content?.fileTree).filter(
    (item) => !!item && typeof item === 'object' && !Array.isArray(item),
  ) as Array<Record<string, unknown>>;

  const fileTree = prioritizeFileTreeEntries(fileTreeEntries).slice(0, 150);
  const recentCommits = normalizeJsonArray(repository.content?.recentCommits).slice(0, 8);
  const recentIssues = normalizeJsonArray(repository.content?.recentIssues).slice(0, 8);

  const completenessJson =
    repository.analysis?.completenessJson && typeof repository.analysis.completenessJson === 'object'
      ? repository.analysis.completenessJson
      : null;

  const ideaFitJson =
    repository.analysis?.ideaFitJson && typeof repository.analysis.ideaFitJson === 'object'
      ? repository.analysis.ideaFitJson
      : null;

  return {
    repository: {
      id: repository.id,
      fullName: repository.fullName,
      name: repository.name,
      description: truncateText(repository.description, 700),
      homepage: repository.homepage,
      language: repository.language,
      topics: repository.topics.slice(0, 15),
      stars: repository.stars,
      forks: repository.forks,
      openIssues: repository.openIssues,
      archived: repository.archived,
      disabled: repository.disabled,
      pushedAtGithub: repository.pushedAtGithub?.toISOString() ?? null,
    },
    fastFilter: {
      roughPass: repository.roughPass,
      roughLevel: repository.roughLevel,
      roughReason: repository.roughReason,
      toolLikeScore:
        typeof repository.toolLikeScore?.toNumber === 'function'
          ? repository.toolLikeScore.toNumber()
          : null,
    },
    completeness: completenessJson,
    ideaFit: ideaFitJson,
    content: {
      readmeText: truncateText(repository.content?.readmeText, 6500),
      rootFiles: normalizeJsonArray(repository.content?.rootFiles).slice(0, 60),
      fileTree,
      packageManifests: normalizeJsonArray(repository.content?.packageManifests).slice(0, 20),
      recentCommits,
      recentIssues,
      hasDockerfile: repository.content?.hasDockerfile ?? false,
      hasCompose: repository.content?.hasCompose ?? false,
      hasCi: repository.content?.hasCi ?? false,
      hasTests: repository.content?.hasTests ?? false,
      hasDocs: repository.content?.hasDocs ?? false,
      hasEnvExample: repository.content?.hasEnvExample ?? false,
    },
  };
}
