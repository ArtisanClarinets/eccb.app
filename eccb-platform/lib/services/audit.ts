import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';

export interface AuditLogData {
  action: string;
  entityType: string;
  entityId?: string;
  oldValues?: any;
  newValues?: any;
}

export async function auditLog(data: AuditLogData): Promise<void> {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    await prisma.auditLog.create({
      data: {
        userId: session?.user?.id,
        userName: session?.user?.name || 'Anonymous',
        ipAddress: headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || '127.0.0.1',
        userAgent: headersList.get('user-agent'),
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        oldValues: data.oldValues ? JSON.stringify(data.oldValues) : null,
        newValues: data.newValues ? JSON.stringify(data.newValues) : null,
      },
    });
  } catch (error) {
    console.error('Audit log error:', error);
    // Don't throw error to avoid breaking the main flow
  }
}
