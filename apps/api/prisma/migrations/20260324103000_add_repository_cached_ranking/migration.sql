CREATE TABLE "RepositoryCachedRanking" (
  "repoId" TEXT NOT NULL,
  "moneyScore" DECIMAL(10,4) NOT NULL,
  "moneyDecision" TEXT NOT NULL,
  "moneyPriority" TEXT NOT NULL,
  "finalVerdict" TEXT NOT NULL,
  "finalAction" TEXT NOT NULL,
  "decisionSource" TEXT NOT NULL,
  "hasConflict" BOOLEAN NOT NULL DEFAULT false,
  "needsRecheck" BOOLEAN NOT NULL DEFAULT false,
  "hasTrainingHints" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RepositoryCachedRanking_pkey" PRIMARY KEY ("repoId")
);

ALTER TABLE "RepositoryCachedRanking"
ADD CONSTRAINT "RepositoryCachedRanking_repoId_fkey"
FOREIGN KEY ("repoId") REFERENCES "Repository"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "RepositoryCachedRanking_moneyScore_updatedAt_idx"
ON "RepositoryCachedRanking"("moneyScore" DESC, "updatedAt" DESC);

CREATE INDEX "RepositoryCachedRanking_moneyPriority_moneyScore_idx"
ON "RepositoryCachedRanking"("moneyPriority", "moneyScore" DESC);

CREATE INDEX "RepositoryCachedRanking_finalVerdict_finalAction_moneyScore_idx"
ON "RepositoryCachedRanking"("finalVerdict", "finalAction", "moneyScore" DESC);

CREATE INDEX "RepositoryCachedRanking_decisionSource_moneyScore_idx"
ON "RepositoryCachedRanking"("decisionSource", "moneyScore" DESC);

CREATE INDEX "RepositoryCachedRanking_needsRecheck_hasConflict_moneyScore_idx"
ON "RepositoryCachedRanking"("needsRecheck", "hasConflict", "moneyScore" DESC);
