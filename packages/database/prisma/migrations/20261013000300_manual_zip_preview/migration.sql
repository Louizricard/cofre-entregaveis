-- CreateTable
CREATE TABLE "ManualPreview" (
    "assetId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "sourceAssetId" UUID NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ManualPreview_pkey" PRIMARY KEY ("assetId")
);

-- CreateIndex
CREATE INDEX "ManualPreview_sourceAssetId_idx" ON "ManualPreview"("sourceAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "ManualPreview_workspaceId_versionId_assetId_key" ON "ManualPreview"("workspaceId", "versionId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_workspaceId_versionId_id_key" ON "Asset"("workspaceId", "versionId", "id");

-- AddForeignKey
ALTER TABLE "ManualPreview" ADD CONSTRAINT "ManualPreview_workspaceId_versionId_assetId_fkey" FOREIGN KEY ("workspaceId", "versionId", "assetId") REFERENCES "Asset"("workspaceId", "versionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPreview" ADD CONSTRAINT "ManualPreview_workspaceId_versionId_sourceAssetId_fkey" FOREIGN KEY ("workspaceId", "versionId", "sourceAssetId") REFERENCES "Asset"("workspaceId", "versionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManualPreview" ADD CONSTRAINT "ManualPreview_distinct_assets_check" CHECK ("assetId" <> "sourceAssetId");
