ALTER TABLE "software_licenses"
ADD COLUMN "is_perpetual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "expires_at" DATE;
