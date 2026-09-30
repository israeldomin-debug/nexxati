CREATE TYPE "AccessoryMovementType" AS ENUM ('IN', 'OUT', 'ADJUSTMENT');

CREATE TABLE "accessory_movements" (
  "id" TEXT NOT NULL,
  "accessory_id" TEXT NOT NULL,
  "type" "AccessoryMovementType" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "reason" TEXT,
  "asset_id" TEXT,
  "user_id" TEXT,
  "performed_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "accessory_movements_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "accessory_movements" ADD CONSTRAINT "accessory_movements_accessory_id_fkey" FOREIGN KEY ("accessory_id") REFERENCES "accessories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accessory_movements" ADD CONSTRAINT "accessory_movements_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "accessory_movements" ADD CONSTRAINT "accessory_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "accessory_movements" ADD CONSTRAINT "accessory_movements_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "accessory_movements_accessory_id_idx" ON "accessory_movements"("accessory_id");
CREATE INDEX "accessory_movements_asset_id_idx" ON "accessory_movements"("asset_id");
CREATE INDEX "accessory_movements_user_id_idx" ON "accessory_movements"("user_id");
CREATE INDEX "accessory_movements_performed_by_id_idx" ON "accessory_movements"("performed_by_id");
CREATE INDEX "accessory_movements_created_at_idx" ON "accessory_movements"("created_at");
