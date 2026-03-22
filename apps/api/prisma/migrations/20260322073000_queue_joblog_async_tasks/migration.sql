ALTER TABLE "JobLog"
ADD COLUMN "queueName" TEXT,
ADD COLUMN "queueJobId" TEXT,
ADD COLUMN "triggeredBy" TEXT,
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "durationMs" INTEGER,
ADD COLUMN "parentJobId" TEXT;

CREATE INDEX "JobLog_queueName_queueJobId_idx"
ON "JobLog"("queueName", "queueJobId");

CREATE INDEX "JobLog_parentJobId_createdAt_idx"
ON "JobLog"("parentJobId", "createdAt" DESC);
