ALTER TABLE "disposal_items"
  ADD COLUMN "accessory_id" TEXT;

CREATE INDEX "disposal_items_accessory_id_idx" ON "disposal_items"("accessory_id");

ALTER TABLE "disposal_items"
  ADD CONSTRAINT "disposal_items_accessory_id_fkey"
  FOREIGN KEY ("accessory_id") REFERENCES "accessories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
