-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Client" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
    "balanceCents" INTEGER NOT NULL,
    "includedRevisionRounds" INTEGER NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Client_workspaceId_id_idx" ON "Client"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Client_workspaceId_email_key" ON "Client"("workspaceId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Client_id_workspaceId_key" ON "Client"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "Project_workspaceId_status_id_idx" ON "Project"("workspaceId", "status", "id");

-- CreateIndex
CREATE INDEX "Project_clientId_workspaceId_idx" ON "Project"("clientId", "workspaceId");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_workspaceId_fkey" FOREIGN KEY ("clientId", "workspaceId") REFERENCES "Client"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain invariants enforced even outside the API.
ALTER TABLE "Client" ADD CONSTRAINT "Client_revision_positive" CHECK ("revision" >= 1);
ALTER TABLE "Client" ADD CONSTRAINT "Client_email_normalized" CHECK ("email" = lower(btrim("email")));
ALTER TABLE "Project" ADD CONSTRAINT "Project_balance_nonnegative" CHECK ("balanceCents" >= 0);
ALTER TABLE "Project" ADD CONSTRAINT "Project_revisions_range" CHECK ("includedRevisionRounds" BETWEEN 0 AND 1000);
ALTER TABLE "Project" ADD CONSTRAINT "Project_revision_positive" CHECK ("revision" >= 1);
ALTER TABLE "Project" ADD CONSTRAINT "Project_currency_brl" CHECK ("currency" = 'BRL');
