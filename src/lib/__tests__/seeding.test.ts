import { beforeEach, describe, expect, it, vi } from 'vitest';

// =============================================================================
// Mock Setup - All mocks must be hoisted before imports
// =============================================================================

const mockMemberDeleteMany = vi.hoisted(() => vi.fn().mockResolvedValue({ count: 0 }));
const mockMemberFindUnique = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const mockMemberCreate = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'member-1', userId: 'user-1', firstName: 'System', lastName: 'Administrator', email: 'admin@eccb.org' }));

const mockUserRoleDeleteMany = vi.hoisted(() => vi.fn().mockResolvedValue({ count: 0 }));
const mockUserRoleFindFirst = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const mockUserRoleCreate = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'user-role-1', userId: 'user-1', roleId: 'role-1' }));

const mockUserDeleteMany = vi.hoisted(() => vi.fn().mockResolvedValue({ count: 0 }));
const mockUserFindUnique = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const mockUserCreate = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'user-1', email: 'admin@eccb.org', name: 'Test Admin', password: 'test-pass', emailVerified: true }));
const mockUserUpdate = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'user-1', email: 'admin@eccb.org', emailVerified: true }));

const mockRoleDeleteMany = vi.hoisted(() => vi.fn().mockResolvedValue({ count: 0 }));
const mockRoleFindUnique = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const mockRoleCreate = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'role-1', name: 'SUPER_ADMIN', displayName: 'Super Administrator', type: 'SUPER_ADMIN', description: 'Full system access' }));

// Mock the prisma client before importing the module
vi.mock('@/lib/db', () => ({
  prisma: {
    member: {
      deleteMany: mockMemberDeleteMany,
      findUnique: mockMemberFindUnique,
      create: mockMemberCreate,
    },
    userRole: {
      deleteMany: mockUserRoleDeleteMany,
      findFirst: mockUserRoleFindFirst,
      create: mockUserRoleCreate,
    },
    user: {
      deleteMany: mockUserDeleteMany,
      findUnique: mockUserFindUnique,
      create: mockUserCreate,
      update: mockUserUpdate,
    },
    role: {
      deleteMany: mockRoleDeleteMany,
      findUnique: mockRoleFindUnique,
      create: mockRoleCreate,
    },
  },
}));

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2a$10$hashedpassword'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

import { assertSuperAdminPasswordPresentForSeed } from '@/lib/seeding';

describe('seeding helper — assertSuperAdminPasswordPresentForSeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assertSuperAdminPasswordPresentForSeed throws when SUPER_ADMIN_PASSWORD is not set', () => {
    const prev = process.env.SUPER_ADMIN_PASSWORD;
    delete process.env.SUPER_ADMIN_PASSWORD;

    expect(() => assertSuperAdminPasswordPresentForSeed()).toThrow('SUPER_ADMIN_PASSWORD is required');

    if (prev !== undefined) process.env.SUPER_ADMIN_PASSWORD = prev;
  });

  it('assertSuperAdminPasswordPresentForSeed does not throw when SUPER_ADMIN_PASSWORD is set', () => {
    const prev = process.env.SUPER_ADMIN_PASSWORD;
    process.env.SUPER_ADMIN_PASSWORD = 'dev-pass-xyz';

    expect(() => assertSuperAdminPasswordPresentForSeed()).not.toThrow();

    if (prev !== undefined) process.env.SUPER_ADMIN_PASSWORD = prev;
    else delete process.env.SUPER_ADMIN_PASSWORD;
  });
});
