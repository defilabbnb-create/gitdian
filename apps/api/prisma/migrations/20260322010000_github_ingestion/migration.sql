ALTER TYPE "RepositorySourceType" ADD VALUE 'GITHUB_SEARCH';

ALTER TABLE "RepositoryContent"
ADD COLUMN "recentCommits" JSONB,
ADD COLUMN "recentIssues" JSONB;
