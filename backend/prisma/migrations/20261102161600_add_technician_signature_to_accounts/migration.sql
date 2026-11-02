ALTER TABLE "cuentas_cobro"
ADD COLUMN "firma_tecnico" TEXT,
ADD COLUMN "fecha_firma" TIMESTAMPTZ(6);
