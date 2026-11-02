const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.tipos_servicio.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }).then(t => {
  t.forEach(x => {
    const n = x.nombre.toLowerCase();
    if (n.includes('recole') || n.includes('neve') || n.includes('ayudante') || n.includes('desmonto') || n.includes('puerta')) {
      console.log(x.nombre + ' | ' + x.valor_estandar);
    }
  });
  p.$disconnect();
});
