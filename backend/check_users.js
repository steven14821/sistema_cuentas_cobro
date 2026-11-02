const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.usuarios.findMany({select:{id:true,email:true,rol:true,nombre_completo:true}}).then(u=>{
  console.log(JSON.stringify(u));
  prisma.$disconnect();
}).catch(e=>{console.error(e);prisma.$disconnect();});
