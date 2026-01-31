import { auth } from './config';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { headers } from 'next/headers';

export async function requirePermission(permission: string): Promise<void> {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const hasPermission = await checkUserPermission(session.user.id, permission);

  if (!hasPermission) {
    throw new Error(`Forbidden: Missing permission ${permission}`);
  }
}

export async function checkUserPermission(
  userId: string,
  permission: string
): Promise<boolean> {
  const userPermissions = await getUserPermissions(userId);
  return userPermissions.includes(permission);
}

export async function getUserPermissions(userId: string): Promise<string[]> {
  const cacheKey = `permissions:${userId}`;
  
  // Check cache first
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    console.error('Redis error:', error);
  }

  // Query from database
  const userRoles = await prisma.userRole.findMany({
    where: {
      userId,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ],
    },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  });

  const permissions = userRoles.flatMap((ur) =>
    ur.role.permissions.map((rp) => rp.permission.name)
  );

  // Remove duplicates
  const uniquePermissions = [...new Set(permissions)];

  // Cache for 5 minutes (300 seconds)
  try {
    await redis.setex(cacheKey, 300, JSON.stringify(uniquePermissions));
  } catch (error) {
    console.error('Redis cache set error:', error);
  }

  return uniquePermissions;
}
