CREATE TYPE "CustodyTermType" AS ENUM ('DELIVERY', 'RETURN');
CREATE TYPE "CustodyTermStatus" AS ENUM ('DRAFT', 'SIGNED', 'CANCELLED');
CREATE TYPE "MaintenanceRecordStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "PurchaseRequestStatus" AS ENUM ('REQUESTED', 'QUOTING', 'APPROVED', 'ORDERED', 'RECEIVED', 'CANCELLED');

CREATE TABLE "custody_terms" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "type" "CustodyTermType" NOT NULL,
  "status" "CustodyTermStatus" NOT NULL DEFAULT 'DRAFT',
  "responsible_user_id" TEXT NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "accessory_items" JSONB NOT NULL DEFAULT '[]',
  "notes" TEXT,
  "signed_by_name" TEXT,
  "signed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "custody_terms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "custody_term_assets" (
  "id" TEXT NOT NULL,
  "custody_term_id" TEXT NOT NULL,
  "asset_id" TEXT NOT NULL,
  CONSTRAINT "custody_term_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "maintenance_records" (
  "id" TEXT NOT NULL,
  "asset_id" TEXT NOT NULL,
  "status" "MaintenanceRecordStatus" NOT NULL DEFAULT 'PLANNED',
  "scheduled_at" DATE NOT NULL,
  "completed_at" TIMESTAMP(3),
  "checklist" JSONB NOT NULL DEFAULT '[]',
  "work_performed" TEXT,
  "parts_used" TEXT,
  "cost" DECIMAL(12,2),
  "next_maintenance_at" DATE,
  "created_by_id" TEXT NOT NULL,
  "completed_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "maintenance_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "knowledge_articles" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "problem" TEXT NOT NULL,
  "solution" TEXT NOT NULL,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "ticket_id" TEXT,
  "published" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "knowledge_articles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_requests" (
  "id" TEXT NOT NULL,
  "accessory_id" TEXT,
  "supplier_id" TEXT,
  "item_name" TEXT NOT NULL,
  "requested_quantity" INTEGER NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'un',
  "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'REQUESTED',
  "estimated_unit_cost" DECIMAL(12,2),
  "notes" TEXT,
  "requested_by_id" TEXT NOT NULL,
  "received_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "custody_terms_number_key" ON "custody_terms"("number");
CREATE INDEX "custody_terms_responsible_user_id_idx" ON "custody_terms"("responsible_user_id");
CREATE INDEX "custody_terms_status_idx" ON "custody_terms"("status");
CREATE INDEX "custody_terms_created_at_idx" ON "custody_terms"("created_at");
CREATE UNIQUE INDEX "custody_term_assets_custody_term_id_asset_id_key" ON "custody_term_assets"("custody_term_id", "asset_id");
CREATE INDEX "custody_term_assets_asset_id_idx" ON "custody_term_assets"("asset_id");
CREATE INDEX "maintenance_records_asset_id_idx" ON "maintenance_records"("asset_id");
CREATE INDEX "maintenance_records_status_idx" ON "maintenance_records"("status");
CREATE INDEX "maintenance_records_scheduled_at_idx" ON "maintenance_records"("scheduled_at");
CREATE INDEX "knowledge_articles_category_idx" ON "knowledge_articles"("category");
CREATE INDEX "knowledge_articles_published_idx" ON "knowledge_articles"("published");
CREATE INDEX "knowledge_articles_ticket_id_idx" ON "knowledge_articles"("ticket_id");
CREATE INDEX "purchase_requests_status_idx" ON "purchase_requests"("status");
CREATE INDEX "purchase_requests_accessory_id_idx" ON "purchase_requests"("accessory_id");
CREATE INDEX "purchase_requests_supplier_id_idx" ON "purchase_requests"("supplier_id");
CREATE INDEX "purchase_requests_created_at_idx" ON "purchase_requests"("created_at");

ALTER TABLE "custody_terms" ADD CONSTRAINT "custody_terms_responsible_user_id_fkey" FOREIGN KEY ("responsible_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "custody_terms" ADD CONSTRAINT "custody_terms_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "custody_term_assets" ADD CONSTRAINT "custody_term_assets_custody_term_id_fkey" FOREIGN KEY ("custody_term_id") REFERENCES "custody_terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "custody_term_assets" ADD CONSTRAINT "custody_term_assets_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_accessory_id_fkey" FOREIGN KEY ("accessory_id") REFERENCES "accessories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
