const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  
  console.log('Searching for user with email tech@em.com...');
  const user = await prisma.usuarios.findFirst({
    where: { email: 'tech@em.com' }
  });

  if (!user) {
    console.log('User not found.');
    return;
  }

  console.log(`User found: ${user.id}. Deleting associated services...`);
  
  const deleted = await prisma.servicios.deleteMany({
    where: { usuario_id: user.id }
  });

  console.log(`Successfully deleted ${deleted.count} services.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    // Normally you'd call prisma.$disconnect() here
  });
