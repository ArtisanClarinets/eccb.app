import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';

/**
 * Recursively convert Date objects to ISO strings for JSON serialization
 */
function serializeForJson(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(serializeForJson);
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = serializeForJson(val);
    }
    return result;
  }
  return value;
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

    // Serialize values to ensure they're JSON-compatible
    const serializedOldValues = serializeForJson(data.oldValues);
    const serializedNewValues = serializeForJson(data.newValues);

    await prisma.auditLog.create({
      data: {
        userId: session?.user?.id,
        userName: session?.user?.name || 'Anonymous',
        ipAddress: headersList.get('x-forwarded-for') || headersList.get('x-real-ip'),
        userAgent: headersList.get('user-agent'),
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        oldValues: serializedOldValues as Prisma.JsonValue ?? Prisma.JsonNull,
        newValues: serializedNewValues as Prisma.JsonValue ?? Prisma.JsonNull,
      },
    });
  } catch (error) {
    // Fail silently to not block the main action, but log the error
    console.error('Failed to create audit log:', error);
  }
}
