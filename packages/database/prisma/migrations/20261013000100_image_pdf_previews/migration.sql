-- CreateEnum
CREATE TYPE "MediaState" AS ENUM ('PENDING', 'RUNNING', 'READY', 'FAILED', 'UNSUPPORTED');

-- CreateTable
CREATE TABLE "MediaJob" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "profile" VARCHAR(40) NOT NULL DEFAULT 'image-pdf-v1',
    "state" "MediaState" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "failureCode" VARCHAR(60),
    "retryAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MediaJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaRun" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "state" VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
    "reservedBytes" BIGINT NOT NULL,
    "keys" JSONB NOT NULL DEFAULT '[]',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MediaRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreviewPage" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "objectKey" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,

    CONSTRAINT "PreviewPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaJob_assetId_key" ON "MediaJob"("assetId");

-- CreateIndex
CREATE INDEX "MediaJob_state_retryAt_idx" ON "MediaJob"("state", "retryAt");

-- CreateIndex
CREATE INDEX "MediaRun_state_expiresAt_idx" ON "MediaRun"("state", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PreviewPage_objectKey_key" ON "PreviewPage"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "PreviewPage_jobId_number_key" ON "PreviewPage"("jobId", "number");

-- AddForeignKey
ALTER TABLE "MediaJob" ADD CONSTRAINT "MediaJob_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaRun" ADD CONSTRAINT "MediaRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "MediaJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreviewPage" ADD CONSTRAINT "PreviewPage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "MediaJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MediaJob" ADD CONSTRAINT "MediaJob_attempts_check" CHECK ("attempts" BETWEEN 0 AND 3);
ALTER TABLE "MediaRun" ADD CONSTRAINT "MediaRun_reservation_check" CHECK ("reservedBytes" BETWEEN 0 AND 33554432);
ALTER TABLE "MediaRun" ADD CONSTRAINT "MediaRun_state_check" CHECK ("state" IN ('RUNNING', 'CLEANUP', 'CLEANED', 'READY'));
ALTER TABLE "MediaRun" ADD CONSTRAINT "MediaRun_keys_check" CHECK (jsonb_typeof("keys") = 'array');
ALTER TABLE "PreviewPage" ADD CONSTRAINT "PreviewPage_bounds_check" CHECK ("number" BETWEEN 1 AND 100 AND "sizeBytes" BETWEEN 1 AND 33554432 AND "width" BETWEEN 1 AND 1600 AND "height" BETWEEN 1 AND 1600);
