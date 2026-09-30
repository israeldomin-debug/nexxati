CREATE TABLE "remote_discovery_jobs" (
    "id" TEXT NOT NULL,
    "site_name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "first_ip" INTEGER NOT NULL,
    "last_ip" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "agent_name" TEXT,
    "results" JSONB,
    "error" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "remote_discovery_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "remote_discovery_jobs_status_created_at_idx" ON "remote_discovery_jobs"("status", "created_at");

ALTER TABLE "remote_discovery_jobs"
ADD CONSTRAINT "remote_discovery_jobs_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
