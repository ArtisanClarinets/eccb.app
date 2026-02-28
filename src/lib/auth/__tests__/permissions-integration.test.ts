import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkUserPermission, getUserPermissions, getUserRoles } from '../permissions';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    userRole: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/redis', () => ({
  redis: {
    get: vi.fn(),
    setex: vi.fn(),
  },
}));

// =============================================================================
// Integration Tests for Permission System
// =============================================================================

describe('Permission System - Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ===========================================================================
  // Role-Based Permission Inheritance Tests
  // ===========================================================================

  describe('Role-Based Permission Inheritance', () => {
    it('should inherit all permissions from assigned role', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(prisma.userRole.findMany).mockResolvedValue([
        {
          userId: 'user-1',
          roleId: 'role-admin',
          expiresAt: null,
          role: {
            id: 'role-admin',
            name: 'ADMIN',
            permissions: [
              { permission: { name: 'music.view.all' } },
              { permission: { name: 'music.create' } },
              { permission: { name: 'member.view.all' } },
            ],
          },
        } as any,
      ]);

      const permissions = await getUserPermissions('user-1');

      expect(permissions).toContain('music.view.all');
      expect(permissions).toContain('music.create');
      expect(permissions).toContain('member.view.all');
      expect(permissions).toHaveLength(3);
    });

    it('should accumulate permissions from multiple roles', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(prisma.userRole.findMany).mockResolvedValue([
        {
          userId: 'user-1',
          roleId: 'role-librarian',
          expiresAt: null,
          role: {
            id: 'role-librarian',
            name: 'LIBRARIAN',
            permissions: [
              { permission: { name: 'music.view.all' } },
              { permission: { name: 'music.edit' } },
            ],
          },
        } as any,
        {
          userId: 'user-1',
          roleId: 'role-member',
          expiresAt: null,
          role: {
            id: 'role-member',
            name: 'MEMBER',
            permissions: [
              { permission: { name: 'music.view.assigned' } },
              { permission: { name: 'member.view.own' } },
            ],
          },
        } as any,
      ]);

      const permissions = await getUserPermissions('user-1');

      expect(permissions).toContain('music.view.all');
      expect(permissions).toContain('music.edit');
      expect(permissions).toContain('music.view.assigned');
      expect(permissions).toContain('member.view.own');
      expect(permissions).toHaveLength(4);
    });

    it('should deduplicate overlapping permissions from multiple roles', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(prisma.userRole.findMany).mockResolvedValue([
        {
          userId: 'user-1',
          roleId: 'role-1',
          expiresAt: null,
          role: {
            id: 'role-1',
            name: 'ROLE_1',
            permissions: [
              { permission: { name: 'music.view.all' } },
              { permission: { name: 'music.create' } },
            ],
          },
        } as any,
        {
          userId: 'user-1',
          roleId: 'role-2',
          expiresAt: null,
          role: {
            id: 'role-2',
            name: 'ROLE_2',
            permissions: [
              { permission: { name: 'music.view.all' } }, // Duplicate
              { permission: { name: 'music.edit' } },
            ],
          },
        } as any,
      ]);

      const permissions = await getUserPermissions('user-1');

      // Should only have 3 unique permissions
      expect(permissions).toHaveLength(3);
      expect(permissions.filter((p) => p === 'music.view.all')).toHaveLength(1);
    });
  });

  // ===========================================================================
  // Permission Checking Tests
  // ===========================================================================

  describe('Permission Checking', () => {
    it('should return true for exact permission match', async () => {
      vi.mocked(redis.get).mockResolvedValue(
        JSON.stringify(['music.view.assigned', 'music.download.assigned'])
      );

      const result = await checkUserPermission('user-1', 'music.view.assigned');
      expect(result).toBe(true);
    });

    it('should return false for missing permission', async () => {
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify(['music.view.assigned']));

      const result = await checkUserPermission('user-1', 'music.view.all');
      expect(result).toBe(false);
    });

    it('should return false for partial permission match', async () => {
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify(['music.view.assigned']));

      // User has 'music.view.assigned' but checking for 'music.view'
      const result = await checkUserPermission('user-1', 'music.view');
      expect(result).toBe(false);
    });

    it('should return false for superset permission', async () => {
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify(['music.view.assigned']));

      // User has 'music.view.assigned' but checking for 'music.view.assigned.extra'
      const result = await checkUserPermission('user-1', 'music.view.assigned.extra');
      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // Caching Behavior Tests
  // ===========================================================================

  describe('Caching Behavior', () => {
    it('should cache permissions after first fetch', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(prisma.userRole.findMany).mockResolvedValue([
        {
          userId: 'user-1',
          roleId: 'role-member',
          expiresAt: null,
          role: {
            id: 'role-member',
            name: 'MEMBER',
            permissions: [{ permission: { name: 'music.view.assigned' } }],
          },
        } as any,
      ]);

      const permissions = await getUserPermissions('user-1');

      expect(permissions).toContain('music.view.assigned');
      expect(redis.setex).toHaveBeenCalledWith(
        'permissions:user-1',
        300,
        expect.stringContaining('music.view.assigned')
      );
    });

    it('should use cached permissions on subsequent calls', async () => {
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify(['cached.permission']));

      const permissions = await getUserPermissions('user-1');

      expect(permissions).toEqual(['cached.permission']);
      expect(prisma.userRole.findMany).not.toHaveBeenCalled();
    });

    it('should cache roles after first fetch', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(prisma.userRole.findMany).mockResolvedValue([
        {
          userId: 'user-1',
          roleId: 'role-member',
          expiresAt: null,
          role: {
            id: 'role-member',
            name: 'MEMBER',
          },
        } as any,
      ]);

      const roles = await getUserRoles('user-1');

      expect(roles).toContain('MEMBER');
      expect(redis.setex).toHaveBeenCalledWith(
        'roles:user-1',
        300,
        expect.stringContaining('MEMBER')
      );
    });
  });

  // ===========================================================================
  // User Without Roles/Permissions Tests
  // ===========================================================================

  describe('User Without Roles/Permissions', () => {
    it('should return empty permissions for user with no roles', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(prisma.userRole.findMany).mockResolvedValue([]);

      const permissions = await getUserPermissions('user-no-roles');
      expect(permissions).toEqual([]);
    });

    it('should return empty roles for user with no roles', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(prisma.userRole.findMany).mockResolvedValue([]);

      const roles = await getUserRoles('user-no-roles');
      expect(roles).toEqual([]);
    });

    it('should return false for any permission check for user without permissions', async () => {
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify([]));

      expect(await checkUserPermission('user-no-perms', 'music.view.all')).toBe(false);
      expect(await checkUserPermission('user-no-perms', 'any.permission')).toBe(false);
    });
  });

  // ===========================================================================
  // Non-Existent User Tests
  // ===========================================================================

  describe('Non-Existent User', () => {
    it('should return empty permissions for non-existent user', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(prisma.userRole.findMany).mockResolvedValue([]);

      const permissions = await getUserPermissions('non-existent-user');
      expect(permissions).toEqual([]);
    });

    it('should return empty roles for non-existent user', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(prisma.userRole.findMany).mockResolvedValue([]);

      const roles = await getUserRoles('non-existent-user');
      expect(roles).toEqual([]);
    });

    it('should return false for permission check on non-existent user', async () => {
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify([]));

      const result = await checkUserPermission('non-existent-user', 'music.view.all');
      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // Permission String Format Tests
  // ===========================================================================

  describe('Permission String Format', () => {
    it('should match three-part permission strings (resource.action.scope)', async () => {
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify(['music.view.all']));

      expect(await checkUserPermission('user-1', 'music.view.all')).toBe(true);
    });

    it('should match two-part permission strings (resource.action)', async () => {
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify(['event.create']));

      expect(await checkUserPermission('user-1', 'event.create')).toBe(true);
    });

    it('should not match malformed permission strings', async () => {
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify(['music.view.all']));

      expect(await checkUserPermission('user-1', 'music:view:all')).toBe(false);
      expect(await checkUserPermission('user-1', 'music-view-all')).toBe(false);
      expect(await checkUserPermission('user-1', 'MUSIC.VIEW.ALL')).toBe(false);
    });
  });

  // ===========================================================================
  // Complex Scenarios Tests
  // ===========================================================================

  describe('Complex Scenarios', () => {
    it('should handle user with many roles and permissions efficiently', async () => {
      // Create a user with 5 roles, each with 10 permissions
      const permissions = Array.from({ length: 50 }, (_, i) => ({
        permission: { name: `resource${Math.floor(i / 10)}.action${i % 10}.scope` },
      }));

      const roles = Array.from({ length: 5 }, (_, i) => ({
        userId: 'power-user',
        roleId: `role-${i}`,
        expiresAt: null,
        role: {
          id: `role-${i}`,
          name: `ROLE_${i}`,
          permissions: permissions.slice(i * 10, (i + 1) * 10),
        },
      }));

      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(prisma.userRole.findMany).mockResolvedValue(roles as any);

      const userPermissions = await getUserPermissions('power-user');

      // Should have all 50 unique permissions
      expect(userPermissions).toHaveLength(50);
    });

    it('should correctly check permissions after role changes (cache invalidation scenario)', async () => {
      // Initially, user has member role only
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(prisma.userRole.findMany).mockResolvedValue([
        {
          userId: 'user-1',
          roleId: 'role-member',
          expiresAt: null,
          role: {
            id: 'role-member',
            name: 'MEMBER',
            permissions: [{ permission: { name: 'music.view.assigned' } }],
          },
        } as any,
      ]);

      // Check initial permissions via getUserPermissions
      const initialPermissions = await getUserPermissions('user-1');
      expect(initialPermissions).toContain('music.view.assigned');
      expect(initialPermissions).not.toContain('music.view.all');

      // Now simulate role change - add admin role
      vi.mocked(redis.get).mockResolvedValue(null); // Clear cache
      vi.mocked(prisma.userRole.findMany).mockResolvedValue([
        {
          userId: 'user-1',
          roleId: 'role-member',
          expiresAt: null,
          role: {
            id: 'role-member',
            name: 'MEMBER',
            permissions: [{ permission: { name: 'music.view.assigned' } }],
          },
        } as any,
        {
          userId: 'user-1',
          roleId: 'role-admin',
          expiresAt: null,
          role: {
            id: 'role-admin',
            name: 'ADMIN',
            permissions: [{ permission: { name: 'music.view.all' } }],
          },
        } as any,
      ]);

      // Check new permissions
      const newPermissions = await getUserPermissions('user-1');
      expect(newPermissions).toContain('music.view.assigned');
      expect(newPermissions).toContain('music.view.all');
    });
  });
});

// =============================================================================
// Permission Constants Integration Tests
// =============================================================================

describe('Permission Constants Integration', () => {
  it('should validate all permission constants against the system', async () => {
    const { ALL_PERMISSIONS, isValidPermission } = await import('../permission-constants');

    // All defined permissions should be valid
    for (const permission of ALL_PERMISSIONS) {
      expect(isValidPermission(permission)).toBe(true);
    }
  });

  it('should have consistent permission groups', async () => {
    const {
      MUSIC_PERMISSIONS,
      MEMBER_PERMISSIONS,
      EVENT_PERMISSIONS,
      ATTENDANCE_PERMISSIONS,
      CMS_PERMISSIONS,
      COMMUNICATION_PERMISSIONS,
      ADMIN_PERMISSIONS,
      STAND_PERMISSIONS,
      ALL_PERMISSIONS,
    } = await import('../permission-constants');

    // Total count should match sum of groups
    const totalFromGroups =
      MUSIC_PERMISSIONS.length +
      MEMBER_PERMISSIONS.length +
      EVENT_PERMISSIONS.length +
      ATTENDANCE_PERMISSIONS.length +
      CMS_PERMISSIONS.length +
      COMMUNICATION_PERMISSIONS.length +
      ADMIN_PERMISSIONS.length +
      STAND_PERMISSIONS.length;

    expect(ALL_PERMISSIONS.length).toBe(totalFromGroups);
  });

  it('should correctly get permissions by resource', async () => {
    const { getPermissionsByResource, MUSIC_PERMISSIONS } = await import('../permission-constants');

    const musicPerms = getPermissionsByResource('music');
    expect(musicPerms.length).toBe(MUSIC_PERMISSIONS.length);

    // All returned permissions should start with 'music.'
    for (const perm of musicPerms) {
      expect(perm.startsWith('music.')).toBe(true);
    }
  });
});
