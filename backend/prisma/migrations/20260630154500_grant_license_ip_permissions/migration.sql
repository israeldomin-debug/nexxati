INSERT INTO "user_permission_grants" ("id", "user_id", "permission", "created_at")
SELECT gen_random_uuid(), u."id", permissions."permission"::"UserPermission", CURRENT_TIMESTAMP
FROM "users" u
CROSS JOIN (
  VALUES
    ('ACCESS_LICENSES'),
    ('ACCESS_IP_ADDRESSES')
) AS permissions("permission")
WHERE u."role" IN ('ATTENDANT', 'ADMIN')
ON CONFLICT ("user_id", "permission") DO NOTHING;

INSERT INTO "user_permission_grants" ("id", "user_id", "permission", "created_at")
SELECT gen_random_uuid(), u."id", permissions."permission"::"UserPermission", CURRENT_TIMESTAMP
FROM "users" u
CROSS JOIN (
  VALUES
    ('MANAGE_LICENSES'),
    ('MANAGE_IP_ADDRESSES')
) AS permissions("permission")
WHERE u."role" = 'ADMIN'
ON CONFLICT ("user_id", "permission") DO NOTHING;
