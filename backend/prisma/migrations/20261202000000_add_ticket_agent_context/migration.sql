ALTER TABLE "tickets" ADD COLUMN "device_hostname" TEXT;
ALTER TABLE "tickets" ADD COLUMN "device_ip" TEXT;
ALTER TABLE "tickets" ADD COLUMN "source_agent_id" TEXT;

CREATE INDEX "tickets_device_hostname_idx" ON "tickets"("device_hostname");
