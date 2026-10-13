CREATE TABLE "ShareLink" (
 "id" UUID NOT NULL, "workspaceId" UUID NOT NULL, "projectId" UUID NOT NULL,
 "tokenHash" CHAR(64) NOT NULL, "expiresAt" TIMESTAMPTZ(3) NOT NULL,
 "revokedAt" TIMESTAMPTZ(3), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ShareLink_project_fkey" FOREIGN KEY ("workspaceId", "projectId") REFERENCES "Project"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "ShareLink_expiration_check" CHECK ("expiresAt" > "createdAt"),
 CONSTRAINT "ShareLink_token_check" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "ShareLink_tokenHash_key" ON "ShareLink"("tokenHash");
CREATE INDEX "ShareLink_workspaceId_projectId_id_idx" ON "ShareLink"("workspaceId", "projectId", "id");
CREATE TABLE "GuestSession" (
 "id" UUID NOT NULL, "shareId" UUID NOT NULL, "tokenHash" CHAR(64) NOT NULL,
 "expiresAt" TIMESTAMPTZ(3) NOT NULL, "revokedAt" TIMESTAMPTZ(3),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "GuestSession_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "GuestSession_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "ShareLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "GuestSession_expiration_check" CHECK ("expiresAt" > "createdAt"),
 CONSTRAINT "GuestSession_token_check" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "GuestSession_tokenHash_key" ON "GuestSession"("tokenHash");
CREATE INDEX "GuestSession_shareId_expiresAt_idx" ON "GuestSession"("shareId", "expiresAt");
