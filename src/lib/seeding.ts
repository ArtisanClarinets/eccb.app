import { prisma } from '@/lib/db';

/**
 * Ensure the `SUPER_ADMIN` role is assigned to an existing user (if present).
 * - Idempotent: safe to run multiple times
 * - Does NOT modify passwords or create users
 */
export async function ensureSuperAdminAssignedToUser(
  adminEmail: string = process.env.SUPER_ADMIN_EMAIL || 'admin@eccb.org'
): Promise<void> {
  // Ensure the SUPER_ADMIN role exists (idempotent)
  const superAdminRole = await prisma.role.upsert({
    where: { name: 'SUPER_ADMIN' },
    update: {},
    create: {
      name: 'SUPER_ADMIN',
      displayName: 'Super Administrator',
      type: 'SUPER_ADMIN',
      description: 'Full system access',
    },
  });

  // Find existing user by email
  const existingUser = await prisma.user.findUnique({
    where: { email: adminEmail },
    include: { roles: true },
  });

  if (!existingUser) return; // nothing to do

  // Idempotent: link user -> SUPER_ADMIN if not already linked
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: existingUser.id, roleId: superAdminRole.id } },
    update: {},
    create: { userId: existingUser.id, roleId: superAdminRole.id },
  });

  // Ensure member profile exists for the admin user
  const existingMember = await prisma.member.findUnique({ where: { userId: existingUser.id } });
  if (!existingMember) {
    await prisma.member.create({
      data: {
        userId: existingUser.id,
        firstName: 'System',
        lastName: 'Administrator',
        email: adminEmail,
        status: 'ACTIVE',
        joinDate: new Date(),
      },
    });
  }
}
