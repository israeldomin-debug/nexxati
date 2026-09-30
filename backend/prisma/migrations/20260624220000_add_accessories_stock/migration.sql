CREATE TABLE "accessories" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "min_quantity" INTEGER NOT NULL DEFAULT 0,
  "unit" TEXT NOT NULL DEFAULT 'un',
  "manufacturer" TEXT,
  "model" TEXT,
  "location" TEXT,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "accessories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "accessories_category_idx" ON "accessories"("category");
CREATE INDEX "accessories_active_idx" ON "accessories"("active");
