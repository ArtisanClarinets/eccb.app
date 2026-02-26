import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';

/**
 * Serialize a value for storage in Prisma's String column.
 * Strings pass through unchanged; objects are JSON-stringified.
 */
function serializeValue(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

export async function auditLog(data: {
  action: string;
  entityType: string;
  entityId?: string;
  oldValues?: unknown;
  newValues?: unknown;
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
        oldValues: serializeValue(data.oldValues),
        newValues: serializeValue(data.newValues),
      },
    });
  } catch (error) {
    // Fail silently to not block the main action, but log the error
    console.error('Failed to create audit log:', error);
  }
}
