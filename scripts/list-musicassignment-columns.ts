import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const assignment = await prisma.musicAssignment.findFirst();
    if (assignment) {
      console.log('MusicAssignment columns:', Object.keys(assignment));
    } else {
      console.log('No assignments found');
    }
  } catch (error: unknown) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
