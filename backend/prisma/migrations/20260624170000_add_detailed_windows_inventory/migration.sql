ALTER TABLE "assets"
ADD COLUMN "cpu_cores" INTEGER,
ADD COLUMN "cpu_logical_processors" INTEGER,
ADD COLUMN "disk_free_gb" INTEGER,
ADD COLUMN "logged_user" TEXT,
ADD COLUMN "windows_license_status" TEXT,
ADD COLUMN "windows_product_key_partial" TEXT;
