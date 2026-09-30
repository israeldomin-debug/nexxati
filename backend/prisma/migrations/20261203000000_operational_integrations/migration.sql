-- Segurança e integrações operacionais: chamados, redes, estoque, manutenção e licenças.
ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_ip_address_key";
ALTER TABLE "network_ip_addresses" DROP CONSTRAINT IF EXISTS "network_ip_addresses_ip_address_key";

ALTER TABLE "assets" ADD COLUMN "network_segment_id" TEXT;
ALTER TABLE "network_ip_addresses" ADD COLUMN "network_segment_id" TEXT;

ALTER TABLE "tickets"
  ADD COLUMN "asset_id" TEXT,
  ADD COLUMN "due_at" TIMESTAMP(3),
  ADD COLUMN "first_response_at" TIMESTAMP(3),
  ADD COLUMN "resolved_at" TIMESTAMP(3),
  ADD COLUMN "closed_at" TIMESTAMP(3);
ALTER TABLE "accessory_movements" ADD COLUMN "balance_id" TEXT;

CREATE TYPE "SoftwareLicenseAssignmentAction" AS ENUM ('ASSIGNED', 'UNASSIGNED', 'DETECTED');

CREATE TABLE "network_segments" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "cidr" TEXT NOT NULL,
  "gateway" TEXT,
  "vlan" INTEGER,
  "location" TEXT,
  "company_id" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "network_segments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "accessory_stock_balances" (
  "id" TEXT NOT NULL,
  "accessory_id" TEXT NOT NULL,
  "company_id" TEXT,
  "location" TEXT,
  "scope_key" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "accessory_stock_balances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "maintenance_parts" (
  "id" TEXT NOT NULL,
  "maintenance_id" TEXT NOT NULL,
  "accessory_id" TEXT NOT NULL,
  "movement_id" TEXT,
  "quantity" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "maintenance_parts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "software_license_assignment_history" (
  "id" TEXT NOT NULL,
  "license_id" TEXT NOT NULL,
  "asset_id" TEXT NOT NULL,
  "action" "SoftwareLicenseAssignmentAction" NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "performed_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "software_license_assignment_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "network_segments_company_id_name_key" ON "network_segments"("company_id", "name");
CREATE INDEX "network_segments_company_id_idx" ON "network_segments"("company_id");
CREATE INDEX "network_segments_active_idx" ON "network_segments"("active");
CREATE INDEX "assets_network_segment_id_idx" ON "assets"("network_segment_id");
CREATE UNIQUE INDEX "assets_network_segment_id_ip_address_key" ON "assets"("network_segment_id", "ip_address");
CREATE UNIQUE INDEX "assets_default_network_ip_address_key" ON "assets"("ip_address") WHERE "network_segment_id" IS NULL AND "ip_address" IS NOT NULL;
CREATE INDEX "network_ip_addresses_network_segment_id_idx" ON "network_ip_addresses"("network_segment_id");
CREATE UNIQUE INDEX "network_ip_addresses_network_segment_id_ip_address_key" ON "network_ip_addresses"("network_segment_id", "ip_address");
CREATE UNIQUE INDEX "network_ip_addresses_default_network_ip_address_key" ON "network_ip_addresses"("ip_address") WHERE "network_segment_id" IS NULL;
CREATE UNIQUE INDEX "accessory_stock_balances_accessory_id_scope_key_key" ON "accessory_stock_balances"("accessory_id", "scope_key");
CREATE INDEX "accessory_stock_balances_company_id_idx" ON "accessory_stock_balances"("company_id");
CREATE UNIQUE INDEX "maintenance_parts_movement_id_key" ON "maintenance_parts"("movement_id");
CREATE UNIQUE INDEX "maintenance_parts_maintenance_id_accessory_id_key" ON "maintenance_parts"("maintenance_id", "accessory_id");
CREATE INDEX "maintenance_parts_accessory_id_idx" ON "maintenance_parts"("accessory_id");
CREATE INDEX "software_license_assignment_history_license_id_created_at_idx" ON "software_license_assignment_history"("license_id", "created_at");
CREATE INDEX "software_license_assignment_history_asset_id_created_at_idx" ON "software_license_assignment_history"("asset_id", "created_at");
CREATE INDEX "tickets_asset_id_idx" ON "tickets"("asset_id");
CREATE INDEX "tickets_due_at_idx" ON "tickets"("due_at");
CREATE INDEX "accessory_movements_balance_id_idx" ON "accessory_movements"("balance_id");

ALTER TABLE "network_segments" ADD CONSTRAINT "network_segments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assets" ADD CONSTRAINT "assets_network_segment_id_fkey" FOREIGN KEY ("network_segment_id") REFERENCES "network_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "network_ip_addresses" ADD CONSTRAINT "network_ip_addresses_network_segment_id_fkey" FOREIGN KEY ("network_segment_id") REFERENCES "network_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "accessory_stock_balances" ADD CONSTRAINT "accessory_stock_balances_accessory_id_fkey" FOREIGN KEY ("accessory_id") REFERENCES "accessories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accessory_stock_balances" ADD CONSTRAINT "accessory_stock_balances_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "maintenance_parts" ADD CONSTRAINT "maintenance_parts_maintenance_id_fkey" FOREIGN KEY ("maintenance_id") REFERENCES "maintenance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "maintenance_parts" ADD CONSTRAINT "maintenance_parts_accessory_id_fkey" FOREIGN KEY ("accessory_id") REFERENCES "accessories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_parts" ADD CONSTRAINT "maintenance_parts_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "accessory_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "software_license_assignment_history" ADD CONSTRAINT "software_license_assignment_history_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "software_licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "software_license_assignment_history" ADD CONSTRAINT "software_license_assignment_history_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "software_license_assignment_history" ADD CONSTRAINT "software_license_assignment_history_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "accessory_movements" ADD CONSTRAINT "accessory_movements_balance_id_fkey" FOREIGN KEY ("balance_id") REFERENCES "accessory_stock_balances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Cada item existente começa com um saldo compatível com sua empresa/local atual.
INSERT INTO "accessory_stock_balances" ("id", "accessory_id", "company_id", "location", "scope_key", "quantity", "updated_at")
SELECT gen_random_uuid()::text, "id", "company_id", "location", COALESCE("company_id", 'NONE') || '|' || COALESCE("location", ''), "quantity", CURRENT_TIMESTAMP
FROM "accessories";

-- Preserva os vínculos atuais como início do histórico de licenças.
INSERT INTO "software_license_assignment_history" ("id", "license_id", "asset_id", "action", "source")
SELECT gen_random_uuid()::text, "license_id", "asset_id", 'ASSIGNED', 'MIGRATION'
FROM "software_license_assets";

-- Aplica o prazo de SLA também aos chamados que já existiam.
UPDATE "tickets"
SET "due_at" = "created_at" + CASE "priority"
  WHEN 4 THEN INTERVAL '4 hours'
  WHEN 3 THEN INTERVAL '8 hours'
  WHEN 2 THEN INTERVAL '24 hours'
  ELSE INTERVAL '72 hours'
END
WHERE "due_at" IS NULL;
