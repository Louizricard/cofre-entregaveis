CREATE TYPE "VersionState" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');
ALTER TABLE "ProjectVersion"
 ADD COLUMN "state" "VersionState" NOT NULL DEFAULT 'DRAFT',
 ADD COLUMN "publishedAt" TIMESTAMPTZ(3),
 ADD COLUMN "publishedById" UUID;
ALTER TABLE "ProjectVersion" ADD CONSTRAINT "ProjectVersion_publishedById_fkey"
 FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "ProjectVersion_one_published_per_project"
 ON "ProjectVersion"("projectId") WHERE "state" = 'PUBLISHED';
ALTER TABLE "ProjectVersion" ADD CONSTRAINT "ProjectVersion_publication_check"
 CHECK (("state" = 'DRAFT' AND "publishedAt" IS NULL AND "publishedById" IS NULL)
 OR ("state" IN ('PUBLISHED', 'SUPERSEDED') AND "publishedAt" IS NOT NULL AND "publishedById" IS NOT NULL));
