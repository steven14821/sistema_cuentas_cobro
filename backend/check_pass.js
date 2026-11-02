const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const p = new PrismaClient();
p.usuarios.findUnique({ where: { email: 'autopass4@em.com' } }).then(async u => {
  if (!u) { console.log('no'); process.exit(); }
  const ok = await bcrypt.compare('temp123', u.password_hash);
  console.log(ok);
  p.$disconnect();
});
