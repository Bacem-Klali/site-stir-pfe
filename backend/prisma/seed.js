import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('password123', 10);

  await prisma.user.upsert({
    where: { email: 'admin@stir.com' },
    update: {},
    create: {
      email: 'admin@stir.com',
      password: hash,
      name: 'Admin',
      role: 'admin',
    },
  });

  console.log('✔ Seed done');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());