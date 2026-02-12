import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { auth } from '@/lib/auth/config';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Roles
  const roles = await Promise.all([
    prisma.role.upsert({
      where: { name: 'SUPER_ADMIN' },
      update: {},
      create: {
        name: 'SUPER_ADMIN',
        displayName: 'Super Administrator',
        type: 'SUPER_ADMIN',
        description: 'Full system access',
      },
    }),
    prisma.role.upsert({
      where: { name: 'ADMIN' },
      update: {},
      create: {
        name: 'ADMIN',
        displayName: 'Administrator',
        type: 'ADMIN',
        description: 'Band operations management',
      },
    }),
    prisma.role.upsert({
      where: { name: 'DIRECTOR' },
      update: {},
      create: {
        name: 'DIRECTOR',
        displayName: 'Director/Staff',
        type: 'DIRECTOR',
        description: 'Musical and operational leadership',
      },
    }),
    prisma.role.upsert({
      where: { name: 'LIBRARIAN' },
      update: {},
      create: {
        name: 'LIBRARIAN',
        displayName: 'Librarian',
        type: 'LIBRARIAN',
        description: 'Music library management',
      },
    }),
    prisma.role.upsert({
      where: { name: 'SECTION_LEADER' },
      update: {},
      create: {
        name: 'SECTION_LEADER',
        displayName: 'Section Leader',
        type: 'SECTION_LEADER',
        description: 'Musical leadership for a section',
      },
    }),
    prisma.role.upsert({
      where: { name: 'MUSICIAN' },
      update: {},
      create: {
        name: 'MUSICIAN',
        displayName: 'Musician',
        type: 'MUSICIAN',
        description: 'Band member',
      },
    }),
    prisma.role.upsert({
      where: { name: 'PUBLIC' },
      update: {},
      create: {
        name: 'PUBLIC',
        displayName: 'Public User',
        type: 'PUBLIC',
        description: 'Limited access for public users',
      },
    }),
  ]);

  console.log(`✅ Created ${roles.length} roles`);

  // 2. Permissions
  const permissions = [
    // Music
    { name: 'music.view.all', resource: 'music', action: 'view', scope: 'all' },
    { name: 'music.view.assigned', resource: 'music', action: 'view', scope: 'assigned' },
    { name: 'music.create', resource: 'music', action: 'create', scope: null },
    { name: 'music.edit', resource: 'music', action: 'edit', scope: null },
    { name: 'music.delete', resource: 'music', action: 'delete', scope: null },
    { name: 'music.upload', resource: 'music', action: 'upload', scope: null },
    { name: 'music.download.all', resource: 'music', action: 'download', scope: 'all' },
    { name: 'music.download.assigned', resource: 'music', action: 'download', scope: 'assigned' },
    
    // Members
    { name: 'member.view.all', resource: 'member', action: 'view', scope: 'all' },
    { name: 'member.view.own', resource: 'member', action: 'view', scope: 'own' },
    { name: 'member.edit.all', resource: 'member', action: 'edit', scope: 'all' },
    { name: 'member.edit.own', resource: 'member', action: 'edit', scope: 'own' },
    { name: 'member.create', resource: 'member', action: 'create', scope: null },
    { name: 'member.delete', resource: 'member', action: 'delete', scope: null },
    
    // Events
    { name: 'event.view.all', resource: 'event', action: 'view', scope: 'all' },
    { name: 'event.create', resource: 'event', action: 'create', scope: null },
    { name: 'event.edit', resource: 'event', action: 'edit', scope: null },
    { name: 'event.delete', resource: 'event', action: 'delete', scope: null },
    
    // Attendance
    { name: 'attendance.view.all', resource: 'attendance', action: 'view', scope: 'all' },
    { name: 'attendance.mark.all', resource: 'attendance', action: 'mark', scope: 'all' },
    { name: 'attendance.mark.own', resource: 'attendance', action: 'mark', scope: 'own' },
    
    // CMS
    { name: 'cms.edit', resource: 'cms', action: 'edit', scope: null },
    { name: 'cms.publish', resource: 'cms', action: 'publish', scope: null },
    
    // System
    { name: 'system.config', resource: 'system', action: 'config', scope: null },
    { name: 'system.audit', resource: 'system', action: 'audit', scope: null },
  ];

  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { name: perm.name },
      update: {},
      create: perm,
    });
  }

  console.log(`✅ Created ${permissions.length} permissions`);

  // 3. Assign permissions to roles
  const superAdminRole = roles.find((r: any) => r.name === 'SUPER_ADMIN')!;
  const adminRole = roles.find((r: any) => r.name === 'ADMIN')!;
  const librarianRole = roles.find((r: any) => r.name === 'LIBRARIAN')!;
  const musicianRole = roles.find((r: any) => r.name === 'MUSICIAN')!;

  // Super admin gets everything
  const allPermissions = await prisma.permission.findMany();
  for (const perm of allPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: superAdminRole.id, permissionId: perm.id } },
      update: {},
      create: { roleId: superAdminRole.id, permissionId: perm.id },
    });
  }

  // Librarian music permissions
  const librarianPermTypes = ['music.view.all', 'music.create', 'music.edit', 'music.delete', 'music.upload', 'music.download.all'];
  for (const permName of librarianPermTypes) {
    const perm = allPermissions.find((p: any) => p.name === permName);
    if (perm) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: librarianRole.id, permissionId: perm.id } },
        update: {},
        create: { roleId: librarianRole.id, permissionId: perm.id },
      });
    }
  }

  // Musician permissions
  const musicianPermNames = ['music.view.assigned', 'music.download.assigned', 'member.view.own', 'member.edit.own', 'event.view.all', 'attendance.mark.own'];
  for (const permName of musicianPermNames) {
    const perm = allPermissions.find((p: any) => p.name === permName);
    if (perm) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: musicianRole.id, permissionId: perm.id } },
        update: {},
        create: { roleId: musicianRole.id, permissionId: perm.id },
      });
    }
  }

  console.log('✅ Assigned permissions to roles');

  // 4. Instruments
  const instruments = [
    { name: 'Piccolo', family: 'Woodwind', sortOrder: 1 },
    { name: 'Flute', family: 'Woodwind', sortOrder: 2 },
    { name: 'Oboe', family: 'Woodwind', sortOrder: 3 },
    { name: 'Bassoon', family: 'Woodwind', sortOrder: 4 },
    { name: 'Eb Clarinet', family: 'Woodwind', sortOrder: 5 },
    { name: 'Bb Clarinet', family: 'Woodwind', sortOrder: 6 },
    { name: 'Alto Clarinet', family: 'Woodwind', sortOrder: 7 },
    { name: 'Bass Clarinet', family: 'Woodwind', sortOrder: 8 },
    { name: 'Alto Saxophone', family: 'Woodwind', sortOrder: 9 },
    { name: 'Tenor Saxophone', family: 'Woodwind', sortOrder: 10 },
    { name: 'Baritone Saxophone', family: 'Woodwind', sortOrder: 11 },
    { name: 'Bb Trumpet', family: 'Brass', sortOrder: 20 },
    { name: 'Cornet', family: 'Brass', sortOrder: 21 },
    { name: 'French Horn', family: 'Brass', sortOrder: 22 },
    { name: 'Trombone', family: 'Brass', sortOrder: 23 },
    { name: 'Bass Trombone', family: 'Brass', sortOrder: 24 },
    { name: 'Euphonium', family: 'Brass', sortOrder: 25 },
    { name: 'Tuba', family: 'Brass', sortOrder: 26 },
    { name: 'Percussion', family: 'Percussion', sortOrder: 30 },
    { name: 'Timpani', family: 'Percussion', sortOrder: 31 },
    { name: 'String Bass', family: 'String', sortOrder: 40 },
  ];

  for (const inst of instruments) {
    await prisma.instrument.upsert({
      where: { name: inst.name },
      update: {},
      create: inst,
    });
  }

  console.log(`✅ Created ${instruments.length} instruments`);

  // 5. Sections
  const sections = [
    { name: 'Woodwinds', sortOrder: 1 },
    { name: 'Brass', sortOrder: 2 },
    { name: 'Percussion', sortOrder: 3 },
  ];

  for (const sec of sections) {
    await prisma.section.upsert({
      where: { name: sec.name },
      update: {},
      create: sec,
    });
  }

  console.log(`✅ Created ${sections.length} sections`);

  // 6. Super Admin User
  const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@eccb.org';
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD || 'eccb_admin_2026!';
  
  // Try to create user via Better Auth to ensure correct password hashing
  let adminUser: any;
  
  try {
    // Check if user exists first
    const existingUser = await prisma.user.findUnique({ where: { email: adminEmail } });
    
    if (existingUser) {
      console.log('Deleting existing admin user to ensure correct password hash...');
      await prisma.member.deleteMany({ where: { userId: existingUser.id } });
      await prisma.userRole.deleteMany({ where: { userId: existingUser.id } });
      await prisma.session.deleteMany({ where: { userId: existingUser.id } });
      await prisma.account.deleteMany({ where: { userId: existingUser.id } });
      await prisma.user.delete({ where: { id: existingUser.id } });
    }

    console.log('Creating admin user via Better Auth...');
    const res = await auth.api.signUpEmail({
      body: {
        email: adminEmail,
        password: adminPassword,
        name: 'System Administrator',
      },
    });
    adminUser = res.user;
  } catch (error) {
    console.error('Error creating admin user via Auth API:', error);
    // Fallback? If auth api fails, we might have issues.
    // Try to find user again in case it was created but threw
    adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });
  }
  
  if (adminUser) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: adminUser.id, roleId: superAdminRole.id } },
      update: {},
      create: { userId: adminUser.id, roleId: superAdminRole.id },
    });

    // Create member profile for admin
    await prisma.member.upsert({
      where: { userId: adminUser.id },
      update: {},
      create: {
        userId: adminUser.id,
        firstName: 'System',
        lastName: 'Administrator',
        email: adminEmail,
        status: 'ACTIVE',
        joinDate: new Date(),
      },
    });
    
    console.log(`✅ Verified Super Admin user: ${adminEmail}`);
  } else {
    console.error('❌ Failed to create or find Super Admin user');
  }

  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });