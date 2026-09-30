ALTER TABLE "users" ADD COLUMN "password_reset_requested_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "password_reset_handled_at" TIMESTAMP(3);

CREATE INDEX "users_password_reset_requested_at_idx" ON "users"("password_reset_requested_at");
