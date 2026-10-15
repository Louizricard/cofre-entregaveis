CREATE TYPE "InvoiceState" AS ENUM ('OPEN', 'PAID', 'WAIVED', 'REVERSED');
CREATE TYPE "SettlementKind" AS ENUM ('EXTERNAL_PAYMENT', 'WAIVER', 'REVERSAL');
CREATE TABLE "Invoice" (
 "id" UUID NOT NULL, "workspaceId" UUID NOT NULL, "projectId" UUID NOT NULL,
 "number" INTEGER NOT NULL DEFAULT 1, "amountCents" INTEGER NOT NULL,
 "currency" CHAR(3) NOT NULL DEFAULT 'BRL', "state" "InvoiceState" NOT NULL DEFAULT 'OPEN', "revision" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "Invoice_amount_check" CHECK ("amountCents" >= 0 AND "currency" = 'BRL' AND "number" > 0 AND "revision" >= 0),
 CONSTRAINT "Invoice_workspaceId_projectId_fkey" FOREIGN KEY ("workspaceId", "projectId") REFERENCES "Project"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Invoice_projectId_number_key" ON "Invoice"("projectId", "number");
CREATE UNIQUE INDEX "Invoice_workspaceId_id_key" ON "Invoice"("workspaceId", "id");
CREATE TABLE "ManualSettlement" (
 "id" UUID NOT NULL, "workspaceId" UUID NOT NULL, "invoiceId" UUID NOT NULL, "actorId" UUID NOT NULL,
 "requestKey" UUID NOT NULL, "payloadHash" CHAR(64) NOT NULL, "kind" "SettlementKind" NOT NULL,
 "reason" VARCHAR(1000) NOT NULL, "invoiceRevision" INTEGER NOT NULL, "amountCents" INTEGER NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ManualSettlement_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ManualSettlement_workspaceId_invoiceId_fkey" FOREIGN KEY ("workspaceId", "invoiceId") REFERENCES "Invoice"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "ManualSettlement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ManualSettlement_workspaceId_requestKey_key" ON "ManualSettlement"("workspaceId", "requestKey");
CREATE UNIQUE INDEX "ManualSettlement_invoiceId_invoiceRevision_key" ON "ManualSettlement"("invoiceId", "invoiceRevision");
CREATE INDEX "ManualSettlement_invoiceId_createdAt_id_idx" ON "ManualSettlement"("invoiceId", "createdAt", "id");
CREATE TABLE "OriginalGrant" (
 "id" UUID NOT NULL, "workspaceId" UUID NOT NULL, "versionId" UUID NOT NULL, "assetId" UUID NOT NULL,
 "invoiceId" UUID NOT NULL, "guestSessionId" UUID NOT NULL, "invoiceRevision" INTEGER NOT NULL,
 "authorEmail" VARCHAR(254) NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "OriginalGrant_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "OriginalGrant_workspaceId_versionId_assetId_fkey" FOREIGN KEY ("workspaceId", "versionId", "assetId") REFERENCES "Asset"("workspaceId", "versionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "OriginalGrant_workspaceId_invoiceId_fkey" FOREIGN KEY ("workspaceId", "invoiceId") REFERENCES "Invoice"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "OriginalGrant_guestSessionId_fkey" FOREIGN KEY ("guestSessionId") REFERENCES "GuestSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "OriginalGrant_guestSessionId_createdAt_idx" ON "OriginalGrant"("guestSessionId", "createdAt");
CREATE INDEX "OriginalGrant_invoiceId_createdAt_idx" ON "OriginalGrant"("invoiceId", "createdAt");
-- Preserve existing balances as OPEN. Zero does not silently grant a waiver.
INSERT INTO "Invoice" ("id", "workspaceId", "projectId", "amountCents", "createdAt", "updatedAt")
 SELECT gen_random_uuid(), "workspaceId", "id", "balanceCents", "createdAt", CURRENT_TIMESTAMP FROM "Project";
