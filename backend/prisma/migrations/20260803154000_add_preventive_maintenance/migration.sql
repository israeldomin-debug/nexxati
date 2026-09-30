ALTER TABLE "assets"
ADD COLUMN "maintenance_interval_days" INTEGER,
ADD COLUMN "next_maintenance_at" DATE;

CREATE INDEX "assets_next_maintenance_at_idx" ON "assets"("next_maintenance_at");
