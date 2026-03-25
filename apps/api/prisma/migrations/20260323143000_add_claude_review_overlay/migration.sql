ALTER TABLE "RepositoryAnalysis"
ADD COLUMN "claudeReviewJson" JSONB,
ADD COLUMN "claudeReviewStatus" TEXT,
ADD COLUMN "claudeReviewProvider" TEXT,
ADD COLUMN "claudeReviewModel" TEXT,
ADD COLUMN "claudeReviewRequestHash" TEXT,
ADD COLUMN "claudeReviewReviewedAt" TIMESTAMP(3),
ADD COLUMN "claudeReviewError" TEXT;

CREATE INDEX "RepositoryAnalysis_claudeReviewReviewedAt_idx"
ON "RepositoryAnalysis"("claudeReviewReviewedAt" DESC);
