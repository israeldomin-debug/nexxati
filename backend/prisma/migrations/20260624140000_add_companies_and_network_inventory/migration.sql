-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "code" TEXT NOT NULL,
    "tax_id" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "companies_code_key" ON "companies"("code");
CREATE UNIQUE INDEX "companies_tax_id_key" ON "companies"("tax_id");

ALTER TABLE "users" ADD COLUMN "company_id" TEXT;
ALTER TABLE "assets" ADD COLUMN "company_id" TEXT,
ADD COLUMN "ip_address" TEXT,
ADD COLUMN "mac_address" TEXT,
ADD COLUMN "hostname" TEXT,
ADD COLUMN "operating_system" TEXT,
ADD COLUMN "processor" TEXT,
ADD COLUMN "memory_mb" INTEGER,
ADD COLUMN "disk_gb" INTEGER,
ADD COLUMN "last_seen_at" TIMESTAMP(3),
ADD COLUMN "discovery_source" TEXT;

CREATE UNIQUE INDEX "assets_mac_address_key" ON "assets"("mac_address");
CREATE INDEX "assets_company_id_idx" ON "assets"("company_id");
CREATE INDEX "assets_ip_address_idx" ON "assets"("ip_address");

ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assets" ADD CONSTRAINT "assets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
