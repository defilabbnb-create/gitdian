CREATE TYPE "RepositoryRunabilityLevel" AS ENUM ('EASY', 'MEDIUM', 'HARD');

ALTER TABLE "Repository"
ADD COLUMN "runability_new" "RepositoryRunabilityLevel";

UPDATE "Repository"
SET "runability_new" = CASE
  WHEN "runability" IS NULL THEN NULL
  WHEN "runability" >= 75 THEN 'EASY'::"RepositoryRunabilityLevel"
  WHEN "runability" >= 45 THEN 'MEDIUM'::"RepositoryRunabilityLevel"
  ELSE 'HARD'::"RepositoryRunabilityLevel"
END;

ALTER TABLE "Repository" DROP COLUMN "runability";

ALTER TABLE "Repository"
RENAME COLUMN "runability_new" TO "runability";
