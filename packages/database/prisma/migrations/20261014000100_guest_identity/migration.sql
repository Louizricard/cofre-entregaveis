CREATE TYPE "IdentityDeliveryState" AS ENUM ('PENDING', 'RUNNING', 'SENT', 'FAILED', 'CANCELLED');
ALTER TABLE "GuestSession" ADD COLUMN "verifiedAt" TIMESTAMPTZ(3), ADD COLUMN "verifiedEmail" VARCHAR(254);
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_identity_check" CHECK (("verifiedAt" IS NULL) = ("verifiedEmail" IS NULL));
CREATE TABLE "IdentityChallenge" (
 "id" UUID NOT NULL PRIMARY KEY, "sessionId" UUID NOT NULL UNIQUE,
 "email" VARCHAR(254) NOT NULL, "codeHash" CHAR(64) NOT NULL, "encryptedCode" TEXT,
 "expiresAt" TIMESTAMPTZ(3) NOT NULL, "consumedAt" TIMESTAMPTZ(3), "attempts" INTEGER NOT NULL DEFAULT 0,
 "deliveryState" "IdentityDeliveryState" NOT NULL DEFAULT 'PENDING', "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
 "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "leaseUntil" TIMESTAMPTZ(3), "leaseToken" UUID, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("sessionId") REFERENCES "GuestSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CHECK ("attempts" BETWEEN 0 AND 5 AND "deliveryAttempts" BETWEEN 0 AND 3),
 CHECK ("codeHash" ~ '^[0-9a-f]{64}$'),
 CHECK ("deliveryState" <> 'RUNNING' OR ("leaseUntil" IS NOT NULL AND "leaseToken" IS NOT NULL))
);
CREATE INDEX "IdentityChallenge_deliveryState_nextAttemptAt_idx" ON "IdentityChallenge"("deliveryState", "nextAttemptAt");
CREATE TABLE "IdentityRequest" (
 "id" UUID NOT NULL PRIMARY KEY, "sessionId" UUID NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("sessionId") REFERENCES "GuestSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "IdentityRequest_sessionId_createdAt_idx" ON "IdentityRequest"("sessionId", "createdAt");
CREATE INDEX "IdentityRequest_createdAt_idx" ON "IdentityRequest"("createdAt");
