const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

p.usuarios.findFirst({
  where: {
    email: 'tecnico@em.com',
    rol: 'Tecnico',
  },
  orderBy: { created_at: 'desc' },
})
  .then((u) => {
    console.log('tecnico@em.com:', u ? JSON.stringify(u) : 'NO ENCONTRADO');
    p.$disconnect();
  })
  .catch((err) => {
    console.error('ERROR:', err && err.stack ? err.stack : err);
    p.$disconnect();
  });
