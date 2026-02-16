import 'dotenv/config';
import { prisma } from '@/lib/db';

async function main() {
  try {
    const cols: any = await prisma.$queryRaw`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'MusicAssignment'
      ORDER BY ordinal_position;
    `;
    console.log('MusicAssignment table columns:', cols);
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
