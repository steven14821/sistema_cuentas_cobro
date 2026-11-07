CREATE TABLE "ordenes_registradas" (
    "numero_orden" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ordenes_registradas_pkey" PRIMARY KEY ("numero_orden")
);

INSERT INTO "ordenes_registradas" ("numero_orden")
SELECT DISTINCT regexp_replace("numero_orden", '[^0-9]', '', 'g')
FROM "servicios"
WHERE regexp_replace("numero_orden", '[^0-9]', '', 'g') <> '';
