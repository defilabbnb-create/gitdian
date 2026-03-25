-- AlterTable
ALTER TABLE "DailyRadarSummary"
ADD COLUMN "telegramSentAt" TIMESTAMP(3),
ADD COLUMN "telegramMessageId" TEXT,
ADD COLUMN "telegramSendStatus" TEXT,
ADD COLUMN "telegramSendError" TEXT;
