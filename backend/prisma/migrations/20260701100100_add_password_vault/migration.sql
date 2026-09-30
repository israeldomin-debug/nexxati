CREATE TYPE "PasswordVaultDeviceType" AS ENUM (
  'DVR',
  'NVR',
  'ROUTER',
  'ANTENNA',
  'ACCESS_POINT',
  'SWITCH',
  'CAMERA',
  'PRINTER',
  'SERVER',
  'OTHER'
);

CREATE TABLE "password_vault_entries" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "device_type" "PasswordVaultDeviceType" NOT NULL DEFAULT 'OTHER',
  "ip_address_id" TEXT,
  "asset_id" TEXT,
  "host" TEXT,
  "url" TEXT,
  "port" INTEGER,
  "protocol" TEXT,
  "username" TEXT NOT NULL,
  "password_encrypted" TEXT NOT NULL,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "password_vault_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "password_vault_entries_device_type_idx" ON "password_vault_entries"("device_type");
CREATE INDEX "password_vault_entries_ip_address_id_idx" ON "password_vault_entries"("ip_address_id");
CREATE INDEX "password_vault_entries_asset_id_idx" ON "password_vault_entries"("asset_id");
CREATE INDEX "password_vault_entries_active_idx" ON "password_vault_entries"("active");

ALTER TABLE "password_vault_entries"
  ADD CONSTRAINT "password_vault_entries_ip_address_id_fkey"
  FOREIGN KEY ("ip_address_id") REFERENCES "network_ip_addresses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "password_vault_entries"
  ADD CONSTRAINT "password_vault_entries_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "assets"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "password_vault_entries"
  ADD CONSTRAINT "password_vault_entries_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
