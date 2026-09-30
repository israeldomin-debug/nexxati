CREATE TYPE "PasswordVaultEntryType" AS ENUM ('USER', 'OTHER');

ALTER TABLE "password_vault_entries"
  ADD COLUMN "entry_type" "PasswordVaultEntryType" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "admin_username" TEXT,
  ADD COLUMN "admin_password_encrypted" TEXT,
  ADD COLUMN "user_username" TEXT,
  ADD COLUMN "user_password_encrypted" TEXT,
  ADD COLUMN "internet_username" TEXT,
  ADD COLUMN "internet_password_encrypted" TEXT,
  ADD COLUMN "p12_username" TEXT,
  ADD COLUMN "p12_password_encrypted" TEXT,
  ADD COLUMN "email_username" TEXT,
  ADD COLUMN "email_password_encrypted" TEXT;

ALTER TABLE "password_vault_entries"
  ALTER COLUMN "username" DROP NOT NULL,
  ALTER COLUMN "password_encrypted" DROP NOT NULL;

CREATE INDEX "password_vault_entries_entry_type_idx" ON "password_vault_entries"("entry_type");
