ALTER TABLE "accessories"
  ADD COLUMN "condition" TEXT NOT NULL DEFAULT 'NEW';

CREATE INDEX "accessories_condition_idx" ON "accessories"("condition");
