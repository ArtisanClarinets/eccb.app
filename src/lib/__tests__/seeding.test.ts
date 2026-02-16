import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { ensureSuperAdminAssignedToUser } from '@/lib/seeding';

describe('seeding helper — ensureSuperAdminAssignedToUser', () => {
  beforeEach(async () => {
    // Clean up any prior test data for the default admin email
    await prisma.member.deleteMany({ where: { email: 'admin@eccb.org' } }).catch(() => {});
    await prisma.userRole.deleteMany({ where: {} }).catch(() => {});
    await prisma.user.deleteMany({ where: { email: 'admin@eccb.org' } }).catch(() => {});
    await prisma.role.deleteMany({ where: { name: 'SUPER_ADMIN' } }).catch(() => {});
  });

  it('assigns SUPER_ADMIN role and creates member when admin user exists', async () => {
    // Ensure role exists
    const role = await prisma.role.create({
      data: {
        name: 'SUPER_ADMIN',
        displayName: 'Super Administrator',
        type: 'SUPER_ADMIN',
        description: 'Full system access',
      },
    });

    // Create a user that mimics the seeded admin (no roles initially)
    const user = await prisma.user.create({
      data: { email: 'admin@eccb.org', name: 'Test Admin', password: 'test-pass' },
    });

    // Ensure no roles exist for the user
    await prisma.userRole.deleteMany({ where: { userId: user.id } }).catch(() => {});

    // Run helper (this is the behavior seed.ts should perform when password is unset)
    await ensureSuperAdminAssignedToUser('admin@eccb.org');

    // Assertions
    const userRole = await prisma.userRole.findFirst({ where: { userId: user.id, roleId: role.id } });
    expect(userRole).toBeTruthy();

    const member = await prisma.member.findUnique({ where: { userId: user.id } });
    expect(member).toBeTruthy();
    expect(member?.firstName).toBe('System');
    expect(member?.lastName).toBe('Administrator');
  });

  it('creates admin user + SUPER_ADMIN role + member when user is missing', async () => {
    // Ensure no user or role exists
    await prisma.user.deleteMany({ where: { email: 'admin@eccb.org' } }).catch(() => {});
    await prisma.role.deleteMany({ where: { name: 'SUPER_ADMIN' } }).catch(() => {});

    // Run helper — should create user, role, userRole and member
    await ensureSuperAdminAssignedToUser('admin@eccb.org');

    const createdUser = await prisma.user.findUnique({ where: { email: 'admin@eccb.org' } });
    expect(createdUser).toBeTruthy();
    expect(createdUser?.email).toBe('admin@eccb.org');

    const role = await prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } });
    expect(role).toBeTruthy();

    const userRole = await prisma.userRole.findFirst({ where: { userId: createdUser!.id, roleId: role!.id } });
    expect(userRole).toBeTruthy();

    const member = await prisma.member.findUnique({ where: { userId: createdUser!.id } });
    expect(member).toBeTruthy();
    expect(member?.firstName).toBe('System');
    expect(member?.lastName).toBe('Administrator');
  });

  it('creates admin user and sets a password when setPassword option is true', async () => {
    // Ensure no user exists
    await prisma.user.deleteMany({ where: { email: 'admin@eccb.org' } }).catch(() => {});
    await prisma.role.deleteMany({ where: { name: 'SUPER_ADMIN' } }).catch(() => {});

    const plaintext = 'DevDefaultPass123!';

    const returned = await ensureSuperAdminAssignedToUser('admin@eccb.org', { setPassword: true, password: plaintext });
    expect(returned).toBe(plaintext);

    const createdUser = await prisma.user.findUnique({ where: { email: 'admin@eccb.org' } });
    expect(createdUser).toBeTruthy();
    expect(createdUser?.password).toBeTruthy();

    // Verify the stored hash matches the plaintext
    const bcrypt = await (await import('bcryptjs')).default;
    const isMatch = await bcrypt.compare(plaintext, createdUser!.password!);
    expect(isMatch).toBe(true);
  });
});
