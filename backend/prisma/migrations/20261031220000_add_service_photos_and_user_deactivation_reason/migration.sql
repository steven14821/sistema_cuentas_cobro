ALTER TABLE "servicios"
ADD COLUMN "fotos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "usuarios"
ADD COLUMN "motivo_inactivacion" TEXT;
