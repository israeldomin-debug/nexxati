CREATE TYPE "DiscoveryIgnoreMode" AS ENUM ('NETWORK', 'PRINTER', 'WINDOWS');

CREATE TABLE "discovery_ignored_ips" (
    "id" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "mode" "DiscoveryIgnoreMode" NOT NULL,
    "reason" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discovery_ignored_ips_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "discovery_ignored_ips_ip_address_mode_key" ON "discovery_ignored_ips"("ip_address", "mode");
CREATE INDEX "discovery_ignored_ips_mode_idx" ON "discovery_ignored_ips"("mode");
CREATE INDEX "discovery_ignored_ips_created_by_id_idx" ON "discovery_ignored_ips"("created_by_id");

ALTER TABLE "discovery_ignored_ips"
ADD CONSTRAINT "discovery_ignored_ips_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
