import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('owner123', 10);
  await prisma.user.upsert({
    where: { email: 'owner@stir.com' },
    update: {},
    create: {
      email: 'owner@stir.com',
      password: hash,
      name: 'Owner',
      role: 'owner',
    },
  });
  console.log('Seed done — owner@stir.com / owner123');
}

main().catch(console.error).finally(() => prisma.$disconnect());