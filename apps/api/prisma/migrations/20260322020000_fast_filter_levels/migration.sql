CREATE TYPE "RepositoryRoughLevel_new" AS ENUM ('A', 'B', 'C');

ALTER TABLE "Repository"
ALTER COLUMN "roughLevel" TYPE "RepositoryRoughLevel_new"
USING (
  CASE
    WHEN "roughLevel"::text = 'HIGH' THEN 'A'::"RepositoryRoughLevel_new"
    WHEN "roughLevel"::text = 'MEDIUM' THEN 'B'::"RepositoryRoughLevel_new"
    WHEN "roughLevel"::text = 'LOW' THEN 'C'::"RepositoryRoughLevel_new"
    ELSE NULL
  END
);

DROP TYPE "RepositoryRoughLevel";

ALTER TYPE "RepositoryRoughLevel_new" RENAME TO "RepositoryRoughLevel";
