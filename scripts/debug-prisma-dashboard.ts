import 'dotenv/config';
import { prisma } from '@/lib/db';

async function main() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'admin@eccb.org' },
      include: {
        member: {
          include: {
            musicAssignments: { include: { piece: true }, orderBy: { assignedAt: 'desc' }, take: 5 },
            attendance: { include: { event: true }, orderBy: { event: { startTime: 'desc' } }, take: 5 },
          },
        },
        notifications: { where: { isRead: false }, orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    console.log('Query result:', JSON.stringify(user, null, 2));
  } catch (err: any) {
    console.error('Query error:', err?.message || err);
    if (err?.code) console.error('Prisma error code:', err.code);
    if (err?.meta) console.error('Prisma meta:', JSON.stringify(err.meta, null, 2));
    if (err?.cause) console.error('Error cause:', err.cause);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
