import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock bcrypt
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-password'),
  },
}));

// Mock Prisma client to avoid PrismaClientConstructorValidationError
vi.mock('@/lib/db', () => ({
  prisma: {
    member: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: 'member-1',
        userId: 'user-1',
        firstName: 'System',
        lastName: 'Administrator',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    },
    userRole: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: 'userRole-1',
        userId: 'user-1',
        roleId: 'role-1',
        createdAt: new Date(),
      }),
      upsert: vi.fn().mockResolvedValue({
        id: 'userRole-1',
        userId: 'user-1',
        roleId: 'role-1',
        createdAt: new Date(),
      }),
    },
    user: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: 'user-1',
        email: 'admin@eccb.org',
        name: 'Test Admin',
        emailVerified: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      update: vi.fn().mockResolvedValue({
        id: 'user-1',
        email: 'admin@eccb.org',
        name: 'Test Admin',
        emailVerified: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    },
    role: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: 'role-1',
        name: 'SUPER_ADMIN',
        displayName: 'Super Administrator',
        type: 'SUPER_ADMIN',
        description: 'Full system access',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      upsert: vi.fn().mockResolvedValue({
        id: 'role-1',
        name: 'SUPER_ADMIN',
        displayName: 'Super Administrator',
        type: 'SUPER_ADMIN',
        description: 'Full system access',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    },
  },
}));

import { prisma } from '@/lib/db';
import { ensureSuperAdminAssignedToUser, assertSuperAdminPasswordPresentForSeed } from '@/lib/seeding';

describe('seeding helper — ensureSuperAdminAssignedToUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates admin user and SUPER_ADMIN role when user is missing', async () => {
    // No user exists, no role exists
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.role.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    
    // Run helper - should not throw PrismaClientConstructorValidationError
    await expect(ensureSuperAdminAssignedToUser('admin@eccb.org')).resolves.not.toThrow();

    // Verify role and user were created
    expect(prisma.role.upsert).toHaveBeenCalled();
    expect(prisma.user.create).toHaveBeenCalled();
  });

  it('handles existing user without password for setPassword option', async () => {
    // Mock user exists but has no password
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1',
      email: 'admin@eccb.org',
      name: 'Test Admin',
      password: null, // User has no password
      emailVerified: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    (prisma.role.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'role-1',
      name: 'SUPER_ADMIN',
      displayName: 'Super Administrator',
      type: 'SUPER_ADMIN',
      description: 'Full system access',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    const plaintext = 'DevDefaultPass123!';
    
    // Run helper with password - should return the plaintext password
    const result = await ensureSuperAdminAssignedToUser('admin@eccb.org', { 
      setPassword: true, 
      password: plaintext 
    });
    
    // Verify password was set and returned
    expect(result).toBe(plaintext);
    expect(prisma.user.update).toHaveBeenCalled();
  });

  // New: require explicit SUPER_ADMIN_PASSWORD for seeding validation
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

    if (prev !== undefined) process.env.SUPER_ADMIN_PASSWORD = prev; else delete process.env.SUPER_ADMIN_PASSWORD;
  });
});
