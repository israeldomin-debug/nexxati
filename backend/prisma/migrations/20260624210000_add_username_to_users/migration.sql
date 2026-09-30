ALTER TABLE "users" ADD COLUMN "username" TEXT;

WITH generated AS (
  SELECT
    "id",
    lower(regexp_replace(split_part("email", '@', 1), '[^a-zA-Z0-9._-]', '', 'g')) AS base_username,
    row_number() OVER (
      PARTITION BY lower(regexp_replace(split_part("email", '@', 1), '[^a-zA-Z0-9._-]', '', 'g'))
      ORDER BY "created_at", "id"
    ) AS duplicate_index
  FROM "users"
  WHERE "username" IS NULL
)
UPDATE "users" AS u
SET "username" = CASE
  WHEN length(g.base_username) >= 3 AND g.duplicate_index = 1 THEN g.base_username
  WHEN length(g.base_username) >= 3 THEN g.base_username || '.' || g.duplicate_index
  ELSE 'usuario.' || g.duplicate_index
END
FROM generated g
WHERE u."id" = g."id";

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
