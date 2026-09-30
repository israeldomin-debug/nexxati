ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'TURNSTILE';

ALTER TABLE "assets"
  DROP COLUMN IF EXISTS "is_online",
  DROP COLUMN IF EXISTS "last_online_check_at",
  ADD COLUMN "communication_port" INTEGER,
  ADD COLUMN "device_identifier" TEXT,
  ADD COLUMN "access_direction" TEXT,
  ADD COLUMN "reader_technology" TEXT,
  ADD COLUMN "capacity_users" INTEGER,
  ADD COLUMN "ntp_server" TEXT;

CREATE TABLE "audit_logs" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resource_type" TEXT NOT NULL,
  "resource_id" TEXT,
  "resource_name" TEXT NOT NULL,
  "changed_fields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "details" JSONB,
  "performed_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_resource_type_idx" ON "audit_logs"("resource_type");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
