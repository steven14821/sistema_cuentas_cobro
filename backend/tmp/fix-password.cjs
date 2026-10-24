const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

async function run() {
  const p = new PrismaClient();
  await p.usuarios.update({
    where: { email: 'tecnico@em.com' },
    data: {
      password_hash: await bcrypt.hash('tecnico123', 10),
    },
  });
  console.log('ok');
  await p.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
