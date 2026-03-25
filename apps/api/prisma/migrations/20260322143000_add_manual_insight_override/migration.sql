-- AlterTable
ALTER TABLE "RepositoryAnalysis"
ADD COLUMN "manualVerdict" TEXT,
ADD COLUMN "manualAction" TEXT,
ADD COLUMN "manualNote" TEXT,
ADD COLUMN "manualUpdatedAt" TIMESTAMP(3);
