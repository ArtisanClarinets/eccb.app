import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    // We need to use raw query to inspect the table structure or just check what prisma returns
    // But since we want to see if columns exist, we can try to find one user and see keys
    const user = await prisma.user.findFirst();
    if (user) {
      console.log('User columns:', Object.keys(user));
    } else {
      console.log('No users found to inspect columns');
    }
  } catch (error: unknown) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
