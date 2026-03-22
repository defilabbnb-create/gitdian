import { Prisma } from '@prisma/client';

type RepositoryWithContent = Prisma.RepositoryGetPayload<{
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
  const importantPrefixes = ['src', 'app', 'docs', 'test', 'tests', '.github'];

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

export function buildCompletenessPromptInput(repository: RepositoryWithContent) {
  const fileTreeEntries = normalizeJsonArray(repository.content?.fileTree).filter(
    (item) => !!item && typeof item === 'object' && !Array.isArray(item),
  ) as Array<Record<string, unknown>>;

  const fileTree = prioritizeFileTreeEntries(fileTreeEntries).slice(0, 180);

  const recentCommits = normalizeJsonArray(repository.content?.recentCommits).slice(0, 10);
  const recentIssues = normalizeJsonArray(repository.content?.recentIssues).slice(0, 10);

  return {
    repository: {
      id: repository.id,
      fullName: repository.fullName,
      description: truncateText(repository.description, 500),
      language: repository.language,
      homepage: repository.homepage,
      stars: repository.stars,
      forks: repository.forks,
      openIssues: repository.openIssues,
      archived: repository.archived,
      disabled: repository.disabled,
      hasWiki: repository.hasWiki,
      hasIssues: repository.hasIssues,
      defaultBranch: repository.defaultBranch,
      pushedAtGithub: repository.pushedAtGithub?.toISOString() ?? null,
      updatedAtGithub: repository.updatedAtGithub?.toISOString() ?? null,
      topics: repository.topics,
    },
    content: {
      readmeText: truncateText(repository.content?.readmeText, 8000),
      rootFiles: normalizeJsonArray(repository.content?.rootFiles).slice(0, 80),
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
