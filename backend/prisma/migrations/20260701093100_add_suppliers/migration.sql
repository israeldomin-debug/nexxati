CREATE TABLE "suppliers" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "legal_name" TEXT,
  "tax_id" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "contact_name" TEXT,
  "category" TEXT,
  "website" TEXT,
  "address" TEXT,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "suppliers_tax_id_key" ON "suppliers"("tax_id");
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");
CREATE INDEX "suppliers_active_idx" ON "suppliers"("active");

ALTER TABLE "assets" ADD COLUMN "supplier_id" TEXT;
ALTER TABLE "accessories" ADD COLUMN "supplier_id" TEXT;
ALTER TABLE "software_licenses" ADD COLUMN "supplier_id" TEXT;

CREATE INDEX "assets_supplier_id_idx" ON "assets"("supplier_id");
CREATE INDEX "accessories_supplier_id_idx" ON "accessories"("supplier_id");
CREATE INDEX "software_licenses_supplier_id_idx" ON "software_licenses"("supplier_id");

ALTER TABLE "assets"
  ADD CONSTRAINT "assets_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "accessories"
  ADD CONSTRAINT "accessories_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "software_licenses"
  ADD CONSTRAINT "software_licenses_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
