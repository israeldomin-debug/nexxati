ALTER TABLE "assets"
  ADD COLUMN "os_version" TEXT,
  ADD COLUMN "os_architecture" TEXT,
  ADD COLUMN "domain" TEXT,
  ADD COLUMN "workgroup" TEXT,
  ADD COLUMN "system_type" TEXT,
  ADD COLUMN "bios_version" TEXT,
  ADD COLUMN "bios_release_date" DATE,
  ADD COLUMN "windows_install_date" TIMESTAMP(3),
  ADD COLUMN "last_boot_at" TIMESTAMP(3);
