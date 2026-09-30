ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'MOUSE';
ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'KEYBOARD';

ALTER TABLE "assets" ADD COLUMN "parent_asset_id" TEXT;

CREATE INDEX "assets_parent_asset_id_idx" ON "assets"("parent_asset_id");

ALTER TABLE "assets"
ADD CONSTRAINT "assets_parent_asset_id_fkey"
FOREIGN KEY ("parent_asset_id") REFERENCES "assets"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
