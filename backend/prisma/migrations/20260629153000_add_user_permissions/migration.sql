CREATE TYPE "UserPermission" AS ENUM (
  'ACCESS_DASHBOARD',
  'ACCESS_TICKETS',
  'ACCESS_ASSETS',
  'MANAGE_ASSETS',
  'DISCOVER_ASSETS',
  'ACCESS_ACCESSORIES',
  'MANAGE_ACCESSORIES',
  'ACCESS_REPORTS',
  'ACCESS_COMPANIES',
  'MANAGE_COMPANIES',
  'ACCESS_USERS',
  'MANAGE_USERS'
);

CREATE TABLE "user_permission_grants" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "permission" "UserPermission" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_permission_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_permission_grants_user_id_permission_key"
  ON "user_permission_grants"("user_id", "permission");

CREATE INDEX "user_permission_grants_permission_idx"
  ON "user_permission_grants"("permission");

ALTER TABLE "user_permission_grants"
  ADD CONSTRAINT "user_permission_grants_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
