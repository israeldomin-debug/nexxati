CREATE TABLE "disposal_items" (
  "id" TEXT NOT NULL,
  "asset_id" TEXT,
  "item_name" TEXT NOT NULL,
  "category" TEXT,
  "asset_tag" TEXT,
  "serial_number" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "reason" TEXT,
  "destination" TEXT,
  "disposal_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "performed_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "disposal_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "disposal_items_asset_id_idx" ON "disposal_items"("asset_id");
CREATE INDEX "disposal_items_performed_by_id_idx" ON "disposal_items"("performed_by_id");
CREATE INDEX "disposal_items_disposal_date_idx" ON "disposal_items"("disposal_date");

ALTER TABLE "disposal_items"
  ADD CONSTRAINT "disposal_items_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "disposal_items"
  ADD CONSTRAINT "disposal_items_performed_by_id_fkey"
  FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
