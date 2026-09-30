ALTER TABLE "assets" ADD COLUMN "last_formatted_at" TIMESTAMP(3);

UPDATE "assets" AS asset
SET "last_formatted_at" = formatted."created_at"
FROM (
  SELECT "asset_id", MAX("created_at") AS "created_at"
  FROM "asset_history"
  WHERE "description" ILIKE '%Serviços:%Formatação%'
     OR "description" ILIKE '%Servicos:%Formatacao%'
  GROUP BY "asset_id"
) AS formatted
WHERE asset."id" = formatted."asset_id";

CREATE INDEX "assets_last_formatted_at_idx" ON "assets"("last_formatted_at");
