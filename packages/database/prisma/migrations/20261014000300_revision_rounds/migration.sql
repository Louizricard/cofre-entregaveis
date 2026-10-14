-- CreateEnum
CREATE TYPE "RevisionState" AS ENUM ('PENDING', 'OPEN', 'RESOLVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "RevisionRound" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "guestSessionId" UUID NOT NULL,
    "requestKey" UUID NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "authorEmail" VARCHAR(254) NOT NULL,
    "summary" VARCHAR(4000) NOT NULL,
    "commentIds" JSONB NOT NULL,
    "state" "RevisionState" NOT NULL,
    "extra" BOOLEAN NOT NULL,
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "decisionReason" VARCHAR(1000),
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevisionRound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RevisionRound_workspaceId_projectId_createdAt_idx" ON "RevisionRound"("workspaceId", "projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RevisionRound_guestSessionId_requestKey_key" ON "RevisionRound"("guestSessionId", "requestKey");
CREATE UNIQUE INDEX "RevisionRound_one_active_per_project" ON "RevisionRound"("projectId") WHERE "state" IN ('OPEN', 'PENDING');

-- AddForeignKey
ALTER TABLE "RevisionRound" ADD CONSTRAINT "RevisionRound_workspaceId_projectId_fkey" FOREIGN KEY ("workspaceId", "projectId") REFERENCES "Project"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionRound" ADD CONSTRAINT "RevisionRound_workspaceId_versionId_fkey" FOREIGN KEY ("workspaceId", "versionId") REFERENCES "ProjectVersion"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionRound" ADD CONSTRAINT "RevisionRound_guestSessionId_fkey" FOREIGN KEY ("guestSessionId") REFERENCES "GuestSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionRound" ADD CONSTRAINT "RevisionRound_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
