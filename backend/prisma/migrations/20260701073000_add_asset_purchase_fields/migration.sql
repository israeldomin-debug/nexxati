ALTER TABLE "assets"
  ADD COLUMN "purchased_by_company_id" TEXT,
  ADD COLUMN "purchase_supplier" TEXT,
  ADD COLUMN "purchase_invoice_number" TEXT,
  ADD COLUMN "purchase_invoice_access_key" TEXT;

CREATE INDEX "assets_purchased_by_company_id_idx" ON "assets"("purchased_by_company_id");

ALTER TABLE "assets"
  ADD CONSTRAINT "assets_purchased_by_company_id_fkey"
  FOREIGN KEY ("purchased_by_company_id") REFERENCES "companies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
