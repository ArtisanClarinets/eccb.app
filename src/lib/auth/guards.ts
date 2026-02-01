import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

// Get current session
export async function getSession() {
  const headersList = await headers();
  return auth.api.getSession({ headers: headersList });
}

// Require authentication - redirect to login if not authenticated
export async function requireAuth() {
  const session = await getSession();
  
  if (!session?.user) {
    redirect('/login');
  }
  
  return session;
}

// Require specific role(s)
export async function requireRole(...roles: string[]) {
  const session = await requireAuth();
  
  const userRoles = await prisma.userRole.findMany({
    where: {
      userId: session.user.id,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ],
    },
    include: {
      role: true,
    },
  });
  
  const userRoleTypes = userRoles.map(ur => ur.role.type);
  const hasRole = roles.some(role => userRoleTypes.includes(role as never));
  
  if (!hasRole) {
    redirect('/forbidden');
  }
  
  return { session, roles: userRoleTypes };
}

// Require specific permission
export async function requirePermission(permission: string) {
  const session = await requireAuth();
  
  const { checkUserPermission } = await import('@/lib/auth/permissions');
  const hasPermission = await checkUserPermission(session.user.id, permission);
  
  if (!hasPermission) {
    redirect('/forbidden');
  }
  
  return session;
}

// Get user with roles and member info
export async function getUserWithProfile() {
  const session = await getSession();
  
  if (!session?.user) {
    return null;
  }
  
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      roles: {
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
      },
      member: {
        include: {
          instruments: {
            include: { instrument: true },
          },
          sections: {
            include: { section: true },
          },
        },
      },
    },
  });
  
  return user;
}

// Check if user has admin access
export async function isAdmin() {
  const session = await getSession();
  
  if (!session?.user) {
    return false;
  }
  
  const adminRoles = ['SUPER_ADMIN', 'ADMIN'];
  
  const userRole = await prisma.userRole.findFirst({
    where: {
      userId: session.user.id,
      role: {
        type: { in: adminRoles as never[] },
      },
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ],
    },
  });
  
  return !!userRole;
}

// Check if user has staff access (admin, director, staff)
export async function isStaff() {
  const session = await getSession();
  
  if (!session?.user) {
    return false;
  }
  
  const staffRoles = ['SUPER_ADMIN', 'ADMIN', 'DIRECTOR', 'STAFF'];
  
  const userRole = await prisma.userRole.findFirst({
    where: {
      userId: session.user.id,
      role: {
        type: { in: staffRoles as never[] },
      },
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ],
    },
  });
  
  return !!userRole;
}

// Check if user is a librarian
export async function isLibrarian() {
  const session = await getSession();
  
  if (!session?.user) {
    return false;
  }
  
  const librarianRoles = ['SUPER_ADMIN', 'ADMIN', 'LIBRARIAN'];
  
  const userRole = await prisma.userRole.findFirst({
    where: {
      userId: session.user.id,
      role: {
        type: { in: librarianRoles as never[] },
      },
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ],
    },
  });
  
  return !!userRole;
}
