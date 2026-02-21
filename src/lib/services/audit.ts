import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';

export async function auditLog(data: {
  action: string;
  entityType: string;
  entityId?: string;
  oldValues?: any;
  newValues?: any;
}): Promise<void> {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    await prisma.auditLog.create({
      data: {
        userId: session?.user?.id,
        userName: session?.user?.name || 'Anonymous',
        ipAddress: headersList.get('x-forwarded-for') || headersList.get('x-real-ip'),
        userAgent: headersList.get('user-agent'),
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        oldValues: data.oldValues ?? Prisma.JsonNull,
        newValues: data.newValues ?? Prisma.JsonNull,
      },
    });
  } catch (error) {
    // Fail silently to not block the main action, but log the error
    console.error('Failed to create audit log:', error);
  }
}
