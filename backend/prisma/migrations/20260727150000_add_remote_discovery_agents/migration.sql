CREATE TABLE "remote_discovery_agents" (
    "id" TEXT NOT NULL,
    "agent_name" TEXT NOT NULL,
    "computer_name" TEXT NOT NULL,
    "agent_info" JSONB NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "remote_discovery_agents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "remote_discovery_agents_agent_name_computer_name_key"
ON "remote_discovery_agents"("agent_name", "computer_name");

CREATE INDEX "remote_discovery_agents_last_seen_at_idx"
ON "remote_discovery_agents"("last_seen_at");
