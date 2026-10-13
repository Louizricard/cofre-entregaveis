-- AlterTable
ALTER TABLE "PreviewPage" ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "kind" VARCHAR(10) NOT NULL DEFAULT 'IMAGE',
ADD COLUMN     "mime" VARCHAR(40) NOT NULL DEFAULT 'image/jpeg';

ALTER TABLE "PreviewPage" DROP CONSTRAINT "PreviewPage_bounds_check";
ALTER TABLE "PreviewPage" ADD CONSTRAINT "PreviewPage_bounds_check" CHECK (
 "number" BETWEEN 1 AND 100 AND "sizeBytes" BETWEEN 1 AND 33554432 AND (
 ("kind" = 'IMAGE' AND "mime" = 'image/jpeg' AND "durationMs" IS NULL AND "width" BETWEEN 1 AND 1600 AND "height" BETWEEN 1 AND 1600)
 OR ("kind" = 'VIDEO' AND "mime" = 'video/mp4' AND "durationMs" IS NOT NULL AND "durationMs" BETWEEN 1 AND 60000 AND "number" = 1 AND "width" BETWEEN 1 AND 1280 AND "height" BETWEEN 1 AND 720)
 OR ("kind" = 'AUDIO' AND "mime" = 'audio/mp4' AND "durationMs" IS NOT NULL AND "durationMs" BETWEEN 1 AND 60000 AND "number" = 1 AND "width" = 0 AND "height" = 0)
 ));
