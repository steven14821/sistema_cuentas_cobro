const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const tipos = await p.tipos_servicio.findMany();
  const users = await p.usuarios.findMany({ select: { username: true, email: true, rol: true } });
  const cuentas = await p.cuentas_cobro.count();
  const servicios = await p.servicios.count();
  console.log('TIPOS:', JSON.stringify(tipos, null, 1));
  console.log('USERS:', JSON.stringify(users));
  console.log('cuentas:', cuentas, 'servicios:', servicios);
  await p.$disconnect();
})().catch((e) => {
  console.error('ERR:', e.message);
  process.exit(1);
});
