export const IDEA_MAIN_CATEGORIES = [
  'tools',
  'platform',
  'ai',
  'data',
  'infra',
  'content',
  'game',
  'other',
] as const;

export type IdeaMainCategory = (typeof IDEA_MAIN_CATEGORIES)[number];

export const IDEA_SUB_CATEGORIES = {
  tools: [
    'devtools',
    'ai-tools',
    'automation',
    'data-tools',
    'browser-extension',
    'productivity',
    'workflow',
    'cli',
    'no-code',
    'ops-tools',
  ],
  platform: [
    'marketplace',
    'app-builder',
    'workflow-platform',
    'developer-platform',
    'api-platform',
  ],
  ai: ['ai-writing', 'ai-code', 'ai-agent', 'ai-image', 'ai-search'],
  data: [
    'data-pipeline',
    'analytics',
    'scraping',
    'etl',
    'dataset',
    'data-observability',
  ],
  infra: [
    'deployment',
    'observability',
    'auth',
    'storage',
    'api-gateway',
    'devops',
    'cloud',
    'monitoring',
    'security',
  ],
  content: ['content-creation', 'seo', 'publishing', 'media'],
  game: ['game-tooling', 'game-content', 'game-platform'],
  other: ['other'],
} as const;

export type IdeaSubCategory = (typeof IDEA_SUB_CATEGORIES)[keyof typeof IDEA_SUB_CATEGORIES][number];

const DEFAULT_SUB_CATEGORY: Record<IdeaMainCategory, IdeaSubCategory> = {
  tools: 'workflow',
  platform: 'workflow-platform',
  ai: 'ai-agent',
  data: 'data-pipeline',
  infra: 'deployment',
  content: 'content-creation',
  game: 'game-tooling',
  other: 'other',
};

export function normalizeIdeaMainCategory(value: unknown): IdeaMainCategory {
  const normalized = String(value ?? '').trim().toLowerCase();

  if ((IDEA_MAIN_CATEGORIES as readonly string[]).includes(normalized)) {
    return normalized as IdeaMainCategory;
  }

  return 'other';
}

export function normalizeIdeaSubCategory(
  mainCategory: IdeaMainCategory,
  value: unknown,
): IdeaSubCategory {
  const normalized = String(value ?? '').trim().toLowerCase();
  const allowed = IDEA_SUB_CATEGORIES[mainCategory] as readonly string[];

  if (allowed.includes(normalized)) {
    return normalized as IdeaSubCategory;
  }

  return DEFAULT_SUB_CATEGORY[mainCategory];
}
