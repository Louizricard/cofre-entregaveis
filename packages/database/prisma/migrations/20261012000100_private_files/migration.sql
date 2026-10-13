-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('INITIATING', 'UPLOADING', 'COMPLETING', 'VALIDATING', 'READY', 'ABORTING', 'ABORTED', 'FAILED');

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "activeUploads" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "storageReservedBytes" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "storageUsedBytes" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ProjectVersion" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "fileName" VARCHAR(200) NOT NULL,
    "mime" VARCHAR(100) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "multipartId" TEXT,
    "status" "UploadStatus" NOT NULL DEFAULT 'INITIATING',
    "failureCode" VARCHAR(60),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "leaseUntil" TIMESTAMPTZ(3),
    "leaseToken" UUID,
    "retryAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cleanupAttempts" INTEGER NOT NULL DEFAULT 0,
    "completionHash" CHAR(64),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectVersion_projectId_number_key" ON "ProjectVersion"("projectId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectVersion_workspaceId_id_key" ON "ProjectVersion"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_objectKey_key" ON "Asset"("objectKey");

-- CreateIndex
CREATE INDEX "Asset_workspaceId_versionId_createdAt_idx" ON "Asset"("workspaceId", "versionId", "createdAt");

-- CreateIndex
CREATE INDEX "Asset_status_expiresAt_idx" ON "Asset"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Asset_status_retryAt_idx" ON "Asset"("status", "retryAt");

-- CreateIndex
CREATE UNIQUE INDEX "Project_workspaceId_id_key" ON "Project"("workspaceId", "id");

-- AddForeignKey
ALTER TABLE "ProjectVersion" ADD CONSTRAINT "ProjectVersion_workspaceId_projectId_fkey" FOREIGN KEY ("workspaceId", "projectId") REFERENCES "Project"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_workspaceId_versionId_fkey" FOREIGN KEY ("workspaceId", "versionId") REFERENCES "ProjectVersion"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Domain invariants for quota accounting and private upload bounds.
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_storage_check" CHECK ("storageUsedBytes" >= 0 AND "storageReservedBytes" >= 0 AND "storageUsedBytes" + "storageReservedBytes" <= 10737418240 AND "activeUploads" BETWEEN 0 AND 5);
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_size_check" CHECK ("sizeBytes" BETWEEN 1 AND 2147483648);
ALTER TABLE "ProjectVersion" ADD CONSTRAINT "ProjectVersion_number_check" CHECK ("number" > 0);
