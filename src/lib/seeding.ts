import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

/**
 * Ensure the `SUPER_ADMIN` role is assigned to the admin user.
 * - Idempotent: safe to run multiple times
 * - Optionally creates/sets a password for development convenience
 *
 * Returns the plaintext password when a password was created/updated; otherwise undefined.
 */
export async function ensureSuperAdminAssignedToUser(
  adminEmail: string = process.env.SUPER_ADMIN_EMAIL || 'admin@eccb.org',
  options?: { setPassword?: boolean; password?: string }
): Promise<string | undefined> {
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
  let user = await prisma.user.findUnique({ where: { email: adminEmail }, include: { roles: true } });

  // If user does not exist, create a minimal user record
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: adminEmail,
        name: 'System Administrator',
        emailVerified: true,
      },
    });
  }

  // Idempotent: link user -> SUPER_ADMIN if not already linked
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: superAdminRole.id } },
    update: {},
    create: { userId: user.id, roleId: superAdminRole.id },
  });

  // Ensure member profile exists for the admin user
  const existingMember = await prisma.member.findUnique({ where: { userId: user.id } });
  if (!existingMember) {
    await prisma.member.create({
      data: {
        userId: user.id,
        firstName: 'System',
        lastName: 'Administrator',
        email: adminEmail,
        status: 'ACTIVE',
        joinDate: new Date(),
      },
    });
  }

  // Optionally set a password (development/testing only)
  if (options?.setPassword) {
    // If user already has a password, do not overwrite unless explicitly provided
    if (!user.password) {
      const plaintext = options.password || process.env.SUPER_ADMIN_DEFAULT_PASSWORD || generateRandomPassword();
      const hashed = await bcrypt.hash(plaintext, 10);
      await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
      return plaintext;
    }
  }

  return undefined;
}

function generateRandomPassword(length = 12) {
  return crypto.randomBytes(Math.ceil(length * 0.75)).toString('base64').slice(0, length);
}
