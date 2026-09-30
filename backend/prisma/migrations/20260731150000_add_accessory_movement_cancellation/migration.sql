ALTER TABLE "accessory_movements"
  ADD COLUMN "canceled_at" TIMESTAMP(3),
  ADD COLUMN "canceled_by_id" TEXT,
  ADD COLUMN "cancellation_reason" TEXT;

ALTER TABLE "accessory_movements"
  ADD CONSTRAINT "accessory_movements_canceled_by_id_fkey"
  FOREIGN KEY ("canceled_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "accessory_movements_canceled_by_id_idx"
  ON "accessory_movements"("canceled_by_id");

CREATE INDEX "accessory_movements_canceled_at_idx"
  ON "accessory_movements"("canceled_at");
