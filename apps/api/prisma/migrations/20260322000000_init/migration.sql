-- CreateEnum
CREATE TYPE "RepositoryRoughLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "RepositoryCompletenessLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "RepositoryOpportunityLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "RepositoryDecision" AS ENUM ('PENDING', 'REJECTED', 'WATCHLIST', 'RECOMMENDED');

-- CreateEnum
CREATE TYPE "RepositoryStatus" AS ENUM ('DISCOVERED', 'SNAPSHOTTED', 'ANALYZED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RepositorySourceType" AS ENUM ('GITHUB', 'MANUAL', 'IMPORTED');

-- CreateEnum
CREATE TYPE "FavoritePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL,
    "githubRepoId" BIGINT NOT NULL,
    "fullName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerLogin" TEXT NOT NULL,
    "htmlUrl" TEXT NOT NULL,
    "description" TEXT,
    "homepage" TEXT,
    "language" TEXT,
    "license" TEXT,
    "defaultBranch" TEXT,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "forks" INTEGER NOT NULL DEFAULT 0,
    "watchers" INTEGER NOT NULL DEFAULT 0,
    "openIssues" INTEGER NOT NULL DEFAULT 0,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "hasWiki" BOOLEAN NOT NULL DEFAULT false,
    "hasIssues" BOOLEAN NOT NULL DEFAULT true,
    "createdAtGithub" TIMESTAMP(3),
    "updatedAtGithub" TIMESTAMP(3),
    "pushedAtGithub" TIMESTAMP(3),
    "lastCommitAt" TIMESTAMP(3),
    "commitCount30d" INTEGER NOT NULL DEFAULT 0,
    "contributorsCount" INTEGER NOT NULL DEFAULT 0,
    "issueActivityScore" DECIMAL(10,4),
    "growth24h" DECIMAL(10,4),
    "growth7d" DECIMAL(10,4),
    "activityScore" DECIMAL(10,4),
    "roughPass" BOOLEAN NOT NULL DEFAULT false,
    "roughLevel" "RepositoryRoughLevel",
    "roughReason" TEXT,
    "toolLikeScore" DECIMAL(10,4),
    "completenessScore" DECIMAL(10,4),
    "completenessLevel" "RepositoryCompletenessLevel",
    "productionReady" BOOLEAN NOT NULL DEFAULT false,
    "runability" DECIMAL(10,4),
    "projectReferenceScore" DECIMAL(10,4),
    "ideaFitScore" DECIMAL(10,4),
    "opportunityLevel" "RepositoryOpportunityLevel",
    "finalScore" DECIMAL(10,4),
    "decision" "RepositoryDecision" NOT NULL DEFAULT 'PENDING',
    "categoryL1" TEXT,
    "categoryL2" TEXT,
    "status" "RepositoryStatus" NOT NULL DEFAULT 'DISCOVERED',
    "isFavorited" BOOLEAN NOT NULL DEFAULT false,
    "sourceType" "RepositorySourceType" NOT NULL DEFAULT 'GITHUB',
    "analysisProvider" TEXT,
    "analysisModel" TEXT,
    "analysisConfidence" DECIMAL(10,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepositorySnapshot" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "forks" INTEGER NOT NULL DEFAULT 0,
    "watchers" INTEGER NOT NULL DEFAULT 0,
    "openIssues" INTEGER NOT NULL DEFAULT 0,
    "commitCount30d" INTEGER NOT NULL DEFAULT 0,
    "contributorsCount" INTEGER NOT NULL DEFAULT 0,
    "issueActivityScore" DECIMAL(10,4),
    "growth24h" DECIMAL(10,4),
    "growth7d" DECIMAL(10,4),
    "activityScore" DECIMAL(10,4),
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepositorySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepositoryContent" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "readmeText" TEXT,
    "fileTree" JSONB,
    "rootFiles" JSONB,
    "hasDockerfile" BOOLEAN NOT NULL DEFAULT false,
    "hasCompose" BOOLEAN NOT NULL DEFAULT false,
    "hasCi" BOOLEAN NOT NULL DEFAULT false,
    "hasTests" BOOLEAN NOT NULL DEFAULT false,
    "hasDocs" BOOLEAN NOT NULL DEFAULT false,
    "hasEnvExample" BOOLEAN NOT NULL DEFAULT false,
    "packageManifests" JSONB,
    "fetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepositoryContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepositoryAnalysis" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "analysisJson" JSONB,
    "completenessJson" JSONB,
    "ideaFitJson" JSONB,
    "extractedIdeaJson" JSONB,
    "negativeFlags" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "provider" TEXT,
    "modelName" TEXT,
    "promptVersion" TEXT,
    "confidence" DECIMAL(10,4),
    "rawResponse" JSONB,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "analyzedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepositoryAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "note" TEXT,
    "priority" "FavoritePriority" NOT NULL DEFAULT 'MEDIUM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "configKey" TEXT NOT NULL,
    "configValue" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLog" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "jobStatus" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "result" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Repository_githubRepoId_key" ON "Repository"("githubRepoId");

-- CreateIndex
CREATE UNIQUE INDEX "Repository_fullName_key" ON "Repository"("fullName");

-- CreateIndex
CREATE UNIQUE INDEX "Repository_htmlUrl_key" ON "Repository"("htmlUrl");

-- CreateIndex
CREATE INDEX "Repository_ownerLogin_name_idx" ON "Repository"("ownerLogin", "name");

-- CreateIndex
CREATE INDEX "Repository_status_idx" ON "Repository"("status");

-- CreateIndex
CREATE INDEX "Repository_decision_idx" ON "Repository"("decision");

-- CreateIndex
CREATE INDEX "Repository_roughPass_idx" ON "Repository"("roughPass");

-- CreateIndex
CREATE INDEX "Repository_isFavorited_idx" ON "Repository"("isFavorited");

-- CreateIndex
CREATE INDEX "Repository_finalScore_idx" ON "Repository"("finalScore" DESC);

-- CreateIndex
CREATE INDEX "Repository_stars_idx" ON "Repository"("stars" DESC);

-- CreateIndex
CREATE INDEX "Repository_updatedAtGithub_idx" ON "Repository"("updatedAtGithub");

-- CreateIndex
CREATE INDEX "Repository_pushedAtGithub_idx" ON "Repository"("pushedAtGithub");

-- CreateIndex
CREATE INDEX "Repository_categoryL1_categoryL2_idx" ON "Repository"("categoryL1", "categoryL2");

-- CreateIndex
CREATE INDEX "RepositorySnapshot_repositoryId_snapshotAt_idx" ON "RepositorySnapshot"("repositoryId", "snapshotAt" DESC);

-- CreateIndex
CREATE INDEX "RepositorySnapshot_snapshotAt_idx" ON "RepositorySnapshot"("snapshotAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "RepositoryContent_repositoryId_key" ON "RepositoryContent"("repositoryId");

-- CreateIndex
CREATE INDEX "RepositoryContent_fetchedAt_idx" ON "RepositoryContent"("fetchedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "RepositoryAnalysis_repositoryId_key" ON "RepositoryAnalysis"("repositoryId");

-- CreateIndex
CREATE INDEX "RepositoryAnalysis_provider_modelName_idx" ON "RepositoryAnalysis"("provider", "modelName");

-- CreateIndex
CREATE INDEX "RepositoryAnalysis_analyzedAt_idx" ON "RepositoryAnalysis"("analyzedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_repositoryId_key" ON "Favorite"("repositoryId");

-- CreateIndex
CREATE INDEX "Favorite_priority_idx" ON "Favorite"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_configKey_key" ON "SystemConfig"("configKey");

-- CreateIndex
CREATE INDEX "JobLog_jobName_createdAt_idx" ON "JobLog"("jobName", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "JobLog_jobStatus_createdAt_idx" ON "JobLog"("jobStatus", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "RepositorySnapshot" ADD CONSTRAINT "RepositorySnapshot_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryContent" ADD CONSTRAINT "RepositoryContent_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepositoryAnalysis" ADD CONSTRAINT "RepositoryAnalysis_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

