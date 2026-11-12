-- Purga del catálogo: estos dos tipos ya no se ofrecen y no tienen servicios que los referencien.
DELETE FROM "tipos_servicio"
WHERE "nombre" IN ('SAMSUNG: Desmonte cualquier tamaño', 'SAMSUNG: Desmonte carro propio');
