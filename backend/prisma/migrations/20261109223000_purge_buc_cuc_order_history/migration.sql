DELETE FROM "cuentas_cobro"
WHERE "id" IN (
    SELECT DISTINCT "cuenta_cobro_id"
    FROM "servicios"
    WHERE "numero_orden" ~ '^(T-)?(BUC|CUC)-'
);

DELETE FROM "ordenes_registradas";
