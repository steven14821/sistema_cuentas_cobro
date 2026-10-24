const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

p.tipos_servicio.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } })
  .then((tipos) => {
    console.log('tipos_servicio activos:', tipos.length);
    tipos.slice(0, 200).forEach((t) => console.log(JSON.stringify(t)));
    p.$disconnect();
  })
  .catch((err) => {
    console.error('ERROR:', err && err.stack ? err.stack : err);
    p.$disconnect();
  });
