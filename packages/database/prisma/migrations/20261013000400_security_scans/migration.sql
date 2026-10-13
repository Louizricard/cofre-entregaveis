-- CreateEnum
CREATE TYPE "ScanState" AS ENUM ('PENDING', 'RUNNING', 'CLEAN', 'REJECTED', 'ERROR');

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "scanAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "scanDefinitions" VARCHAR(40),
ADD COLUMN     "scanLeaseToken" UUID,
ADD COLUMN     "scanLeaseUntil" TIMESTAMPTZ(3),
ADD COLUMN     "scanRetryAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "scanSha256" CHAR(64),
ADD COLUMN     "scanStatus" "ScanState" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "scannedAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "Asset_status_scanStatus_scanRetryAt_idx" ON "Asset"("status", "scanStatus", "scanRetryAt");
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_scan_attempts_check" CHECK ("scanAttempts" BETWEEN 0 AND 3);
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_clean_scan_check" CHECK ("scanStatus" <> 'CLEAN' OR ("scannedAt" IS NOT NULL AND "scanSha256" IS NOT NULL AND "scanDefinitions" IS NOT NULL));
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_scan_hash_check" CHECK ("scanSha256" IS NULL OR "scanSha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_scan_lease_check" CHECK ("scanStatus" <> 'RUNNING' OR ("scanLeaseToken" IS NOT NULL AND "scanLeaseUntil" IS NOT NULL));
