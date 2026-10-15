-- CreateTable
CREATE TABLE "Approval" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "guestSessionId" UUID NOT NULL,
    "authorEmail" VARCHAR(254) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" UUID NOT NULL,
    "guestSessionId" UUID NOT NULL,
    "requestKey" UUID NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "approvalId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Approval_versionId_key" ON "Approval"("versionId");

-- CreateIndex
CREATE INDEX "Approval_workspaceId_versionId_idx" ON "Approval"("workspaceId", "versionId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_approvalId_idx" ON "ApprovalRequest"("approvalId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequest_guestSessionId_requestKey_key" ON "ApprovalRequest"("guestSessionId", "requestKey");

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_workspaceId_versionId_fkey" FOREIGN KEY ("workspaceId", "versionId") REFERENCES "ProjectVersion"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_guestSessionId_fkey" FOREIGN KEY ("guestSessionId") REFERENCES "GuestSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_guestSessionId_fkey" FOREIGN KEY ("guestSessionId") REFERENCES "GuestSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
