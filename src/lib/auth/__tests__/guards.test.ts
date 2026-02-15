import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getSession,
  requireAuth,
  requireRole,
  requirePermission,
  getUserWithProfile,
  isAdmin,
  isStaff,
  isLibrarian,
} from '../guards';
import { prisma } from '@/lib/db';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    userRole: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`Redirect to ${path}`);
  }),
}));

vi.mock('@/lib/auth/config', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth/permissions', () => ({
  checkUserPermission: vi.fn(),
}));

// Helper to create mock session
function createMockSession(userId: string = 'user-123') {
  return {
    user: {
      id: userId,
      email: 'test@example.com',
      name: 'Test User',
    },
    session: {
      id: 'session-123',
      userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  } as any;
}

// Helper to create mock user role
function createMockUserRole(roleType: string, roleName: string) {
  return {
    id: `ur-${roleType}`,
    userId: 'user-123',
    roleId: `role-${roleType}`,
    role: {
      id: `role-${roleType}`,
      name: roleName,
      type: roleType,
    },
  } as any;
}

describe('Auth Guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ===========================================================================
  // getSession Tests
  // ===========================================================================

  describe('getSession', () => {
    it('should return session when user is authenticated', async () => {
      const { auth } = await import('@/lib/auth/config');
      const mockSession = createMockSession();
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);

      const result = await getSession();

      expect(result).toEqual(mockSession);
    });

    it('should return null when no session exists', async () => {
      const { auth } = await import('@/lib/auth/config');
      vi.mocked(auth.api.getSession).mockResolvedValue(null);

      const result = await getSession();

      expect(result).toBeNull();
    });

    it('should return session object even when user is null', async () => {
      const { auth } = await import('@/lib/auth/config');
      vi.mocked(auth.api.getSession).mockResolvedValue({
        session: { id: 'session-123' },
        user: null,
      } as any);

      const result = await getSession();

      // getSession returns the session object, it doesn't check for user
      expect(result).not.toBeNull();
      expect(result?.session).toEqual({ id: 'session-123' });
      expect(result?.user).toBeNull();
    });
  });

  // ===========================================================================
  // requireAuth Tests
  // ===========================================================================

  describe('requireAuth', () => {
    it('should return session when user is authenticated', async () => {
      const { auth } = await import('@/lib/auth/config');
      const mockSession = createMockSession();
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);

      const result = await requireAuth();

      expect(result).toEqual(mockSession);
    });

    it('should redirect to login when no session exists', async () => {
      const { auth } = await import('@/lib/auth/config');
      vi.mocked(auth.api.getSession).mockResolvedValue(null);

      await expect(requireAuth()).rejects.toThrow('Redirect to /login');
    });

    it('should redirect to login when session has no user', async () => {
      const { auth } = await import('@/lib/auth/config');
      vi.mocked(auth.api.getSession).mockResolvedValue({
        session: { id: 'session-123' },
        user: null,
      } as any);

      await expect(requireAuth()).rejects.toThrow('Redirect to /login');
    });
  });

  // ===========================================================================
  // requireRole Tests (guards.ts version - redirects on failure)
  // ===========================================================================

  describe('requireRole (guards)', () => {
    it('should return session and roles when user has required role', async () => {
      const { auth } = await import('@/lib/auth/config');
      const mockSession = createMockSession();
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);
      vi.mocked(prisma.userRole.findMany).mockResolvedValue([
        createMockUserRole('ADMIN', 'Administrator'),
      ]);

      const result = await requireRole('ADMIN');

      expect(result.session).toEqual(mockSession);
      expect(result.roles).toContain('ADMIN');
    });

    it('should return session when user has one of multiple required roles', async () => {
      const { auth } = await import('@/lib/auth/config');
      const mockSession = createMockSession();
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);
      vi.mocked(prisma.userRole.findMany).mockResolvedValue([
        createMockUserRole('DIRECTOR', 'Director'),
      ]);

      const result = await requireRole('ADMIN', 'DIRECTOR', 'STAFF');

      expect(result.session).toEqual(mockSession);
      expect(result.roles).toContain('DIRECTOR');
    });

    it('should redirect to forbidden when user lacks required role', async () => {
      const { auth } = await import('@/lib/auth/config');
      const mockSession = createMockSession();
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);
      vi.mocked(prisma.userRole.findMany).mockResolvedValue([
        createMockUserRole('MEMBER', 'Member'),
      ]);

      await expect(requireRole('ADMIN')).rejects.toThrow('Redirect to /forbidden');
    });

    it('should redirect to forbidden when user has no roles', async () => {
      const { auth } = await import('@/lib/auth/config');
      const mockSession = createMockSession();
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);
      vi.mocked(prisma.userRole.findMany).mockResolvedValue([]);

      await expect(requireRole('ADMIN')).rejects.toThrow('Redirect to /forbidden');
    });

    it('should filter out expired role assignments', async () => {
      const { auth } = await import('@/lib/auth/config');
      const mockSession = createMockSession();
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);

      // Verify the query includes expiration filter
      (prisma.userRole.findMany as any).mockImplementation(async (args: any) => {
        expect(args.where.OR).toContainEqual({ expiresAt: null });
        expect(args.where.OR).toContainEqual({ expiresAt: { gt: expect.any(Date) } });
        return [createMockUserRole('ADMIN', 'Administrator')];
      });

      await requireRole('ADMIN');
    });
  });

  // ===========================================================================
  // requirePermission Tests (guards.ts version - redirects on failure)
  // ===========================================================================

  describe('requirePermission (guards)', () => {
    it('should return session when user has required permission', async () => {
      const { auth } = await import('@/lib/auth/config');
      const { checkUserPermission } = await import('@/lib/auth/permissions');
      const mockSession = createMockSession();
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);
      vi.mocked(checkUserPermission).mockResolvedValue(true);

      const result = await requirePermission('music.view.all');

      expect(result).toEqual(mockSession);
      expect(checkUserPermission).toHaveBeenCalledWith('user-123', 'music.view.all');
    });

    it('should redirect to forbidden when user lacks required permission', async () => {
      const { auth } = await import('@/lib/auth/config');
      const { checkUserPermission } = await import('@/lib/auth/permissions');
      const mockSession = createMockSession();
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);
      vi.mocked(checkUserPermission).mockResolvedValue(false);

      await expect(requirePermission('music.view.all')).rejects.toThrow(
        'Redirect to /forbidden'
      );
    });

    it('should redirect to login when not authenticated', async () => {
      const { auth } = await import('@/lib/auth/config');
      vi.mocked(auth.api.getSession).mockResolvedValue(null);

      await expect(requirePermission('music.view.all')).rejects.toThrow('Redirect to /login');
    });
  });

  // ===========================================================================
  // getUserWithProfile Tests
  // ===========================================================================

  describe('getUserWithProfile', () => {
    it('should return null when no session exists', async () => {
      const { auth } = await import('@/lib/auth/config');
      vi.mocked(auth.api.getSession).mockResolvedValue(null);

      const result = await getUserWithProfile();

      expect(result).toBeNull();
    });

    it('should return user with roles and member info', async () => {
      const { auth } = await import('@/lib/auth/config');
      const mockSession = createMockSession();
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        roles: [
          {
            id: 'ur-1',
            userId: 'user-123',
            roleId: 'role-admin',
            role: {
              id: 'role-admin',
              name: 'ADMIN',
              type: 'ADMIN',
              permissions: [
                { permission: { name: 'music.view.all' } },
                { permission: { name: 'member.view.all' } },
              ],
            },
          },
        ],
        member: {
          id: 'member-123',
          userId: 'user-123',
          firstName: 'Test',
          lastName: 'User',
          instruments: [{ instrument: { id: 'inst-1', name: 'Trumpet' } }],
          sections: [{ section: { id: 'sec-1', name: 'Brass' } }],
        },
      };
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);

      const result = await getUserWithProfile();

      expect(result).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        include: expect.objectContaining({
          roles: expect.any(Object),
          member: expect.any(Object),
        }),
      });
    });

    it('should return user without member info if not a member', async () => {
      const { auth } = await import('@/lib/auth/config');
      const mockSession = createMockSession();
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        roles: [],
        member: null,
      };
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);

      const result = await getUserWithProfile();

      expect(result).toEqual(mockUser);
    });
  });

  // ===========================================================================
  // isAdmin Tests
  // ===========================================================================

  describe('isAdmin', () => {
    it('should return false when no session exists', async () => {
      const { auth } = await import('@/lib/auth/config');
      vi.mocked(auth.api.getSession).mockResolvedValue(null);

      const result = await isAdmin();

      expect(result).toBe(false);
    });

    it('should return true when user has SUPER_ADMIN role', async () => {
      const { auth } = await import('@/lib/auth/config');
      const mockSession = createMockSession();
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);
      vi.mocked(prisma.userRole.findFirst).mockResolvedValue(
        createMockUserRole('SUPER_ADMIN', 'Super Administrator')
      );

      const result = await isAdmin();

      expect(result).toBe(true);
    });

    it('should return true when user has ADMIN role', async () => {
      const { auth } = await import('@/lib/auth/config');
      const mockSession = createMockSession();
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);
      vi.mocked(prisma.userRole.findFirst).mockResolvedValue(
        createMockUserRole('ADMIN', 'Administrator')
      );

      const result = await isAdmin();

      expect(result).toBe(true);
    });

    it('should return false when user has other roles', async () => {
      const { auth } = await import('@/lib/auth/config');
      const mockSession = createMockSession();
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);
      vi.mocked(prisma.userRole.findFirst).mockResolvedValue(null);

      const result = await isAdmin();

      expect(result).toBe(false);
    });

    it('should filter out expired admin roles', async () => {
      const { auth } = await import('@/lib/auth/config');
      const mockSession = createMockSession();
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);

      (prisma.userRole.findFirst as any).mockImplementation(async (args: any) => {
        expect(args.where.OR).toContainEqual({ expiresAt: null });
        expect(args.where.OR).toContainEqual({ expiresAt: { gt: expect.any(Date) } });
        return null;
      });

      await isAdmin();
    });
  });

  // ===========================================================================
  // isStaff Tests
  // ===========================================================================

  describe('isStaff', () => {
    it('should return false when no session exists', async () => {
      const { auth } = await import('@/lib/auth/config');
      vi.mocked(auth.api.getSession).mockResolvedValue(null);

      const result = await isStaff();

      expect(result).toBe(false);
    });

    it('should return true when user has SUPER_ADMIN role', async () => {
      const { auth } = await import('@/lib/auth/config');
      const mockSession = createMockSession();
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);
      vi.mocked(prisma.userRole.findFirst).mockResolvedValue(
        createMockUserRole('SUPER_ADMIN', 'Super Administrator')
      );

      const result = await isStaff();

      expect(result).toBe(true);
    });

    it('should return true when user has ADMIN role', async () => {
      const { auth } = await import('@/lib/auth/config');
      const mockSession = createMockSession();
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);
      vi.mocked(prisma.userRole.findFirst).mockResolvedValue(
        createMockUserRole('ADMIN', 'Administrator')
      );

      const result = await isStaff();

      expect(result).toBe(true);
    });

    it('should return true when user has DIRECTOR role', async () => {
      const { auth } = await import('@/lib/auth/config');
      const mockSession = createMockSession();
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);
      vi.mocked(prisma.userRole.findFirst).mockResolvedValue(
        createMockUserRole('DIRECTOR', 'Director')
      );

      const result = await isStaff();

      expect(result).toBe(true);
    });

    it('should return true when user has STAFF role', async () => {
      const { auth } = await import('@/lib/auth/config');
      const mockSession = createMockSession();
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);
      vi.mocked(prisma.userRole.findFirst).mockResolvedValue(
        createMockUserRole('STAFF', 'Staff Member')
      );

      const result = await isStaff();

      expect(result).toBe(true);
    });

    it('should return false when user has MEMBER role only', async () => {
      const { auth } = await import('@/lib/auth/config');
      const mockSession = createMockSession();
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);
      vi.mocked(prisma.userRole.findFirst).mockResolvedValue(null);

      const result = await isStaff();

      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // isLibrarian Tests
  // ===========================================================================

  describe('isLibrarian', () => {
    it('should return false when no session exists', async () => {
      const { auth } = await import('@/lib/auth/config');
      vi.mocked(auth.api.getSession).mockResolvedValue(null);

      const result = await isLibrarian();

      expect(result).toBe(false);
    });

    it('should return true when user has SUPER_ADMIN role', async () => {
      const { auth } = await import('@/lib/auth/config');
      const mockSession = createMockSession();
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);
      vi.mocked(prisma.userRole.findFirst).mockResolvedValue(
        createMockUserRole('SUPER_ADMIN', 'Super Administrator')
      );

      const result = await isLibrarian();

      expect(result).toBe(true);
    });

    it('should return true when user has ADMIN role', async () => {
      const { auth } = await import('@/lib/auth/config');
      const mockSession = createMockSession();
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);
      vi.mocked(prisma.userRole.findFirst).mockResolvedValue(
        createMockUserRole('ADMIN', 'Administrator')
      );

      const result = await isLibrarian();

      expect(result).toBe(true);
    });

    it('should return true when user has LIBRARIAN role', async () => {
      const { auth } = await import('@/lib/auth/config');
      const mockSession = createMockSession();
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);
      vi.mocked(prisma.userRole.findFirst).mockResolvedValue(
        createMockUserRole('LIBRARIAN', 'Librarian')
      );

      const result = await isLibrarian();

      expect(result).toBe(true);
    });

    it('should return false when user has MEMBER role only', async () => {
      const { auth } = await import('@/lib/auth/config');
      const mockSession = createMockSession();
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);
      vi.mocked(prisma.userRole.findFirst).mockResolvedValue(null);

      const result = await isLibrarian();

      expect(result).toBe(false);
    });
  });
});

// =============================================================================
// Role Hierarchy Tests
// =============================================================================

describe('Role Hierarchy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should recognize SUPER_ADMIN as having all elevated privileges', async () => {
    const { auth } = await import('@/lib/auth/config');
    const mockSession = createMockSession();
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);
    vi.mocked(prisma.userRole.findFirst).mockResolvedValue(
      createMockUserRole('SUPER_ADMIN', 'Super Administrator')
    );

    expect(await isAdmin()).toBe(true);
    expect(await isStaff()).toBe(true);
    expect(await isLibrarian()).toBe(true);
  });

  it('should recognize ADMIN as having admin, staff, and librarian privileges', async () => {
    const { auth } = await import('@/lib/auth/config');
    const mockSession = createMockSession();
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);
    vi.mocked(prisma.userRole.findFirst).mockResolvedValue(
      createMockUserRole('ADMIN', 'Administrator')
    );

    expect(await isAdmin()).toBe(true);
    expect(await isStaff()).toBe(true);
    expect(await isLibrarian()).toBe(true);
  });

  it('should recognize DIRECTOR as having staff privileges only', async () => {
    const { auth } = await import('@/lib/auth/config');
    const mockSession = createMockSession();
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);

    // Mock findFirst to return the DIRECTOR role only for staff check
    (prisma.userRole.findFirst as any).mockImplementation(async (args: any) => {
      const roleTypes = args.where.role.type.in;
      // If checking for admin roles, return null (DIRECTOR is not admin)
      if (roleTypes.includes('SUPER_ADMIN') || roleTypes.includes('ADMIN')) {
        // But only if the array doesn't include DIRECTOR/STAFF
        if (!roleTypes.includes('DIRECTOR') && !roleTypes.includes('STAFF')) {
          return null;
        }
      }
      // If checking for staff roles (includes DIRECTOR), return the role
      if (roleTypes.includes('DIRECTOR')) {
        return createMockUserRole('DIRECTOR', 'Director');
      }
      return null;
    });

    expect(await isAdmin()).toBe(false);
    expect(await isStaff()).toBe(true);
    expect(await isLibrarian()).toBe(false);
  });

  it('should recognize LIBRARIAN as having librarian privileges only', async () => {
    const { auth } = await import('@/lib/auth/config');
    const mockSession = createMockSession();
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);

    // Mock findFirst to return the LIBRARIAN role only for librarian check
    (prisma.userRole.findFirst as any).mockImplementation(async (args: any) => {
      const roleTypes = args.where.role.type.in;
      // If checking for librarian roles (includes LIBRARIAN), return the role
      if (roleTypes.includes('LIBRARIAN')) {
        return createMockUserRole('LIBRARIAN', 'Librarian');
      }
      // Otherwise return null
      return null;
    });

    expect(await isAdmin()).toBe(false);
    expect(await isStaff()).toBe(false);
    expect(await isLibrarian()).toBe(true);
  });
});

// =============================================================================
// Edge Cases and Error Handling
// =============================================================================

describe('Edge Cases and Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle session with missing user properties gracefully', async () => {
    const { auth } = await import('@/lib/auth/config');
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: 'user-123' },
      session: { id: 'session-123' },
    } as any);

    const result = await getSession();
    expect(result).toBeDefined();
    expect(result?.user?.id).toBe('user-123');
  });

  it('should handle database errors in requireRole gracefully', async () => {
    const { auth } = await import('@/lib/auth/config');
    const mockSession = createMockSession();
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);
    vi.mocked(prisma.userRole.findMany).mockRejectedValue(
      new Error('Database connection error')
    );

    await expect(requireRole('ADMIN')).rejects.toThrow();
  });

  it('should handle database errors in isAdmin gracefully', async () => {
    const { auth } = await import('@/lib/auth/config');
    const mockSession = createMockSession();
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);
    vi.mocked(prisma.userRole.findFirst).mockRejectedValue(
      new Error('Database connection error')
    );

    await expect(isAdmin()).rejects.toThrow();
  });

  it('should handle empty string permission in requirePermission', async () => {
    const { auth } = await import('@/lib/auth/config');
    const { checkUserPermission } = await import('@/lib/auth/permissions');
    const mockSession = createMockSession();
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);
    vi.mocked(checkUserPermission).mockResolvedValue(false);

    await expect(requirePermission('')).rejects.toThrow('Redirect to /forbidden');
  });

  it('should handle multiple concurrent role checks', async () => {
    const { auth } = await import('@/lib/auth/config');
    const mockSession = createMockSession();
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);
    vi.mocked(prisma.userRole.findFirst).mockResolvedValue(
      createMockUserRole('ADMIN', 'Administrator')
    );

    // Run multiple checks concurrently
    const results = await Promise.all([isAdmin(), isStaff(), isLibrarian()]);

    expect(results[0]).toBe(true);
    expect(results[1]).toBe(true);
    expect(results[2]).toBe(true);
  });
});
