DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "assets"
    WHERE "ip_address" IS NOT NULL AND btrim("ip_address") <> ''
    GROUP BY "ip_address"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Existem ativos com IP duplicado. Corrija os registros duplicados antes de aplicar esta migration.';
  END IF;
END $$;

DROP INDEX IF EXISTS "assets_ip_address_idx";

ALTER TABLE "assets" ADD CONSTRAINT "assets_ip_address_key" UNIQUE ("ip_address");
