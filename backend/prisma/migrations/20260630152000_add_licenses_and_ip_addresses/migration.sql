ALTER TYPE "UserPermission" ADD VALUE IF NOT EXISTS 'ACCESS_LICENSES';
ALTER TYPE "UserPermission" ADD VALUE IF NOT EXISTS 'MANAGE_LICENSES';
ALTER TYPE "UserPermission" ADD VALUE IF NOT EXISTS 'ACCESS_IP_ADDRESSES';
ALTER TYPE "UserPermission" ADD VALUE IF NOT EXISTS 'MANAGE_IP_ADDRESSES';

CREATE TYPE "IpAddressSource" AS ENUM ('MANUAL', 'ASSET', 'DISCOVERY');

CREATE TABLE "software_licenses" (
  "id" TEXT NOT NULL,
  "software_name" TEXT NOT NULL,
  "version" TEXT,
  "owner_company_id" TEXT,
  "invoice_number" TEXT,
  "license_number" TEXT NOT NULL,
  "purchased_from" TEXT,
  "purchase_date" DATE,
  "seats" INTEGER NOT NULL DEFAULT 1,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "software_licenses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "software_license_assets" (
  "id" TEXT NOT NULL,
  "license_id" TEXT NOT NULL,
  "asset_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "software_license_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "network_ip_addresses" (
  "id" TEXT NOT NULL,
  "ip_address" TEXT NOT NULL,
  "hostname" TEXT,
  "mac_address" TEXT,
  "description" TEXT,
  "source" "IpAddressSource" NOT NULL DEFAULT 'MANUAL',
  "company_id" TEXT,
  "asset_id" TEXT,
  "last_seen_at" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "network_ip_addresses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "software_licenses_license_number_key" ON "software_licenses"("license_number");
CREATE INDEX "software_licenses_software_name_idx" ON "software_licenses"("software_name");
CREATE INDEX "software_licenses_owner_company_id_idx" ON "software_licenses"("owner_company_id");

CREATE UNIQUE INDEX "software_license_assets_license_id_asset_id_key" ON "software_license_assets"("license_id", "asset_id");
CREATE INDEX "software_license_assets_asset_id_idx" ON "software_license_assets"("asset_id");

CREATE UNIQUE INDEX "network_ip_addresses_ip_address_key" ON "network_ip_addresses"("ip_address");
CREATE INDEX "network_ip_addresses_source_idx" ON "network_ip_addresses"("source");
CREATE INDEX "network_ip_addresses_active_idx" ON "network_ip_addresses"("active");
CREATE INDEX "network_ip_addresses_company_id_idx" ON "network_ip_addresses"("company_id");
CREATE INDEX "network_ip_addresses_asset_id_idx" ON "network_ip_addresses"("asset_id");

ALTER TABLE "software_licenses"
  ADD CONSTRAINT "software_licenses_owner_company_id_fkey"
  FOREIGN KEY ("owner_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "software_license_assets"
  ADD CONSTRAINT "software_license_assets_license_id_fkey"
  FOREIGN KEY ("license_id") REFERENCES "software_licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "software_license_assets"
  ADD CONSTRAINT "software_license_assets_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
