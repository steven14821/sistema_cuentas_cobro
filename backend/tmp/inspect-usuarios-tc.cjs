const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

p.usuarios.findMany({
  where: {
    rol: 'Tecnico',
    activo: true,
  },
  orderBy: [{ nombre_completo: 'asc' }],
})
  .then((usuarios) => {
    console.log('usuarios tecnicos activos:', usuarios.length);
    usuarios.forEach((u) => console.log(JSON.stringify(u)));
    p.$disconnect();
  })
  .catch((err) => {
    console.error('ERROR:', err && err.stack ? err.stack : err);
    p.$disconnect();
  });
