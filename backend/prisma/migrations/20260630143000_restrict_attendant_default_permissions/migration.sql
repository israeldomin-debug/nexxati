DELETE FROM "user_permission_grants" upg
USING "users" u
WHERE upg."user_id" = u."id"
  AND u."role" = 'ATTENDANT'
  AND upg."permission" IN (
    'MANAGE_ASSETS',
    'DISCOVER_ASSETS',
    'MANAGE_ACCESSORIES',
    'ACCESS_COMPANIES',
    'MANAGE_COMPANIES',
    'ACCESS_USERS',
    'MANAGE_USERS'
  );
