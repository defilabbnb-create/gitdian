import { Prisma } from '@prisma/client';

type RepositoryWithLightContext = Prisma.RepositoryGetPayload<{
  include: {
    content: true;
    analysis: true;
  };
}>;

function cleanText(value: string | null | undefined) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function truncateText(value: string | null | undefined, maxLength: number) {
  const normalized = cleanText(value);

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}\n...[truncated]`;
}

function pickReadmePreview(value: string | null | undefined) {
  const normalized = cleanText(value);

  if (!normalized) {
    return '';
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);

  return truncateText(paragraphs.join('\n\n'), 900);
}

export function buildIdeaSnapshotPromptInput(repository: RepositoryWithLightContext) {
  return {
    repository: {
      id: repository.id,
      fullName: repository.fullName,
      name: repository.name,
      ownerLogin: repository.ownerLogin,
      description: truncateText(repository.description, 320),
      language: repository.language,
      topics: repository.topics.slice(0, 8),
      homepage: repository.homepage,
      stars: repository.stars,
      forks: repository.forks,
      createdAtGithub: repository.createdAtGithub?.toISOString() ?? null,
      updatedAtGithub: repository.updatedAtGithub?.toISOString() ?? null,
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
    content: {
      readmePreview: pickReadmePreview(repository.content?.readmeText),
    },
  };
}
