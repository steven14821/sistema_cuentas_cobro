ALTER TABLE "tipos_servicio"
ADD COLUMN IF NOT EXISTS "requiere_valor_admin" BOOLEAN NOT NULL DEFAULT false;

UPDATE "tipos_servicio"
SET "requiere_valor_admin" = true
WHERE "nombre" = 'ZURICH: Reparación';

DELETE FROM "tipos_servicio"
WHERE "nombre" = 'SAMSUNG: Ayudantes';