CREATE TABLE "Comment" (
 "id" UUID NOT NULL PRIMARY KEY, "workspaceId" UUID NOT NULL, "versionId" UUID NOT NULL, "assetId" UUID NOT NULL,
 "guestSessionId" UUID NOT NULL, "clientRequestId" UUID NOT NULL, "payloadHash" CHAR(64) NOT NULL,
 "authorEmail" VARCHAR(254) NOT NULL, "body" VARCHAR(4000) NOT NULL, "anchorKind" VARCHAR(20) NOT NULL,
 "timeMs" INTEGER, "page" INTEGER, "x" DOUBLE PRECISION, "y" DOUBLE PRECISION,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("workspaceId", "versionId", "assetId") REFERENCES "Asset"("workspaceId", "versionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("guestSessionId") REFERENCES "GuestSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CHECK (length(btrim("body")) BETWEEN 1 AND 4000), CHECK ("payloadHash" ~ '^[0-9a-f]{64}$'),
 CHECK (("anchorKind" = 'GENERAL' AND "timeMs" IS NULL AND "page" IS NULL AND "x" IS NULL AND "y" IS NULL)
 OR ("anchorKind" = 'TIME' AND "timeMs" >= 0 AND "timeMs" IS NOT NULL AND "page" IS NULL AND "x" IS NULL AND "y" IS NULL)
 OR ("anchorKind" = 'IMAGE_POINT' AND "timeMs" IS NULL AND "page" IS NULL AND "x" IS NOT NULL AND "y" IS NOT NULL AND "x" BETWEEN 0 AND 1 AND "y" BETWEEN 0 AND 1)
 OR ("anchorKind" = 'PDF_POINT' AND "timeMs" IS NULL AND "page" >= 1 AND "page" IS NOT NULL AND "x" IS NOT NULL AND "y" IS NOT NULL AND "x" BETWEEN 0 AND 1 AND "y" BETWEEN 0 AND 1))
);
CREATE UNIQUE INDEX "Comment_guestSessionId_clientRequestId_key" ON "Comment"("guestSessionId", "clientRequestId");
CREATE INDEX "Comment_workspaceId_assetId_createdAt_id_idx" ON "Comment"("workspaceId", "assetId", "createdAt", "id");
CREATE INDEX "Comment_workspaceId_versionId_idx" ON "Comment"("workspaceId", "versionId");
