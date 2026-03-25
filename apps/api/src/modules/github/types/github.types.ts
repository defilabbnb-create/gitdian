export type GitHubRepositoryOwner = {
  login: string;
};

export type GitHubRepositoryLicense = {
  key: string;
  name: string;
  spdx_id: string | null;
};

export type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  owner: GitHubRepositoryOwner;
  html_url: string;
  description: string | null;
  homepage: string | null;
  language: string | null;
  license: GitHubRepositoryLicense | null;
  default_branch: string | null;
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
  open_issues_count: number;
  topics?: string[];
  archived: boolean;
  disabled: boolean;
  has_wiki: boolean;
  has_issues: boolean;
  created_at: string;
  updated_at: string;
  pushed_at: string | null;
};

export type GitHubSearchResponse = {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubRepository[];
};

export type GitHubReadmeResponse = {
  content: string;
  encoding: string;
};

export type GitHubContentItem = {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  size?: number;
  download_url?: string | null;
};

export type GitHubCommitAuthor = {
  name: string;
  date: string;
};

export type GitHubCommitItem = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: GitHubCommitAuthor;
  };
  author: {
    login: string;
  } | null;
};

export type GitHubIssueItem = {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: string;
  created_at: string;
  updated_at: string;
  user: {
    login: string;
  } | null;
  pull_request?: Record<string, unknown>;
};

export type GitHubIdeaSnapshotJobPayload = {
  repositoryId: string;
  windowDate: string;
  fromBackfill?: boolean;
  runFastFilter?: boolean;
  runDeepAnalysis?: boolean;
  deepAnalysisOnlyIfPromising?: boolean;
  targetCategories?: string[];
  rootJobId?: string | null;
};
