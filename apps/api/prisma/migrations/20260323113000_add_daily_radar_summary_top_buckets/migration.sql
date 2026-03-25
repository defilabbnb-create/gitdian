ALTER TABLE "DailyRadarSummary"
ADD COLUMN "topGoodRepositoryIds" JSONB,
ADD COLUMN "topCloneRepositoryIds" JSONB,
ADD COLUMN "topIgnoredRepositoryIds" JSONB;
