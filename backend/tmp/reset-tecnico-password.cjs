const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();
async function run() {
  const password = '123456';
  const hash = await bcrypt.hash(password, 10);
  const updated = await prisma.usuarios.update({
    where: { email: 'tecnico@em.com' },
    data: { password_hash: hash },
  });
  console.log(JSON.stringify({ id: updated.id, email: updated.email }, null, 2));
}
run().finally(() => prisma.$disconnect());
