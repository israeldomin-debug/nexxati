ALTER TABLE "accessories"
  ADD COLUMN "serial_number" TEXT,
  ADD COLUMN "part_number" TEXT,
  ADD COLUMN "band_frequency" TEXT,
  ADD COLUMN "company_id" TEXT,
  ADD COLUMN "purchased_by_company_id" TEXT,
  ADD COLUMN "purchase_supplier" TEXT,
  ADD COLUMN "purchase_invoice_number" TEXT,
  ADD COLUMN "purchase_invoice_access_key" TEXT,
  ADD COLUMN "purchase_date" DATE,
  ADD COLUMN "warranty_expires" DATE,
  ADD COLUMN "purchase_cost" DECIMAL(12, 2);

CREATE INDEX "accessories_company_id_idx" ON "accessories"("company_id");
CREATE INDEX "accessories_purchased_by_company_id_idx" ON "accessories"("purchased_by_company_id");

ALTER TABLE "accessories"
  ADD CONSTRAINT "accessories_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "accessories"
  ADD CONSTRAINT "accessories_purchased_by_company_id_fkey"
  FOREIGN KEY ("purchased_by_company_id") REFERENCES "companies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
