-- CreateTable
CREATE TABLE "DailyRadarSummary" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "fetchedRepositories" INTEGER NOT NULL DEFAULT 0,
    "snapshotGenerated" INTEGER NOT NULL DEFAULT 0,
    "deepAnalyzed" INTEGER NOT NULL DEFAULT 0,
    "promisingCandidates" INTEGER NOT NULL DEFAULT 0,
    "goodIdeas" INTEGER NOT NULL DEFAULT 0,
    "cloneCandidates" INTEGER NOT NULL DEFAULT 0,
    "ignoredIdeas" INTEGER NOT NULL DEFAULT 0,
    "topCategories" JSONB,
    "topRepositoryIds" JSONB,
    "topItems" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyRadarSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyRadarSummary_date_key" ON "DailyRadarSummary"("date");

-- CreateIndex
CREATE INDEX "DailyRadarSummary_date_idx" ON "DailyRadarSummary"("date" DESC);
