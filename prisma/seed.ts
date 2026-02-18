import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { auth } from '@/lib/auth/config';
import {
  ALL_PERMISSIONS,
  MUSIC_VIEW_ALL,
  MUSIC_CREATE,
  MUSIC_EDIT,
  MUSIC_DELETE,
  MUSIC_UPLOAD,
  MUSIC_DOWNLOAD_ALL,
  MUSIC_VIEW_ASSIGNED,
  MUSIC_DOWNLOAD_ASSIGNED,
  MEMBER_VIEW_OWN,
  MEMBER_EDIT_OWN,
  EVENT_VIEW_ALL,
  ATTENDANCE_MARK_OWN,
} from '@/lib/auth/permission-constants';
import { assertSuperAdminPasswordPresentForSeed } from '@/lib/seeding';

// If DATABASE_URL points to MySQL/MariaDB, provide a driver adapter required by the "client" (WASM) engine.
function _parseDbUrl(url?: string) {
  if (!url) return null;
  const regex = /^mysql:\/\/([^:]+):([^@]+)@([^:/]+)(?::(\d+))?\/(.+)$/;
  const match = url.match(regex);
  if (!match) return null;
  return {
    user: decodeURIComponent(match[1]),
    password: decodeURIComponent(match[2]),
    host: match[3],
    port: match[4] ? Number(match[4]) : 3306,
    database: match[5],
  };
}

const _cfg = _parseDbUrl(process.env.DATABASE_URL);
const _adapter = _cfg ? new (await import('@prisma/adapter-mariadb')).PrismaMariaDb({ host: _cfg.host, user: _cfg.user, password: _cfg.password, database: _cfg.database }) : undefined;

const prisma = new PrismaClient({
  ...( _adapter ? { adapter: _adapter } : {} ),
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Roles
  const roles = await Promise.all([
    prisma.role.upsert({
      where: { name: 'SUPER_ADMIN' },
      update: {},
      create: { name: 'SUPER_ADMIN', displayName: 'Super Administrator', type: 'SUPER_ADMIN', description: 'Full system access' },
    }),
    prisma.role.upsert({
      where: { name: 'ADMIN' },
      update: {},
      create: { name: 'ADMIN', displayName: 'Administrator', type: 'ADMIN', description: 'Band operations management' },
    }),
    prisma.role.upsert({
      where: { name: 'DIRECTOR' },
      update: {},
      create: { name: 'DIRECTOR', displayName: 'Director/Staff', type: 'DIRECTOR', description: 'Musical and operational leadership' },
    }),
    prisma.role.upsert({
      where: { name: 'LIBRARIAN' },
      update: {},
      create: { name: 'LIBRARIAN', displayName: 'Librarian', type: 'LIBRARIAN', description: 'Music library management' },
    }),
    prisma.role.upsert({
      where: { name: 'SECTION_LEADER' },
      update: {},
      create: { name: 'SECTION_LEADER', displayName: 'Section Leader', type: 'SECTION_LEADER', description: 'Musical leadership for a section' },
    }),
    prisma.role.upsert({
      where: { name: 'MUSICIAN' },
      update: {},
      create: { name: 'MUSICIAN', displayName: 'Musician', type: 'MUSICIAN', description: 'Band member' },
    }),
    prisma.role.upsert({
      where: { name: 'PUBLIC' },
      update: {},
      create: { name: 'PUBLIC', displayName: 'Public User', type: 'PUBLIC', description: 'Limited access for public users' },
    }),
  ]);

  console.log(`✅ Created ${roles.length} roles`);

  // 2. Permissions
  const permissionsData = ALL_PERMISSIONS.map((name) => {
    const parts = name.split('.');
    return { 
      name, 
      resource: parts[0], 
      action: parts[1], 
      scope: parts[2] || null 
    };
  });

  // Execute sequentially to avoid connection pool exhaustion
  for (const perm of permissionsData) {
    await prisma.permission.upsert({
      where: { name: perm.name },
      update: {},
      create: perm,
    });
  }

  console.log(`✅ Created ${permissionsData.length} permissions`);

  // 3. Assign permissions to roles
  const superAdminRole = roles.find((r) => r.name === 'SUPER_ADMIN');
  const librarianRole = roles.find((r) => r.name === 'LIBRARIAN');
  const musicianRole = roles.find((r) => r.name === 'MUSICIAN');

  if (!superAdminRole || !librarianRole || !musicianRole) {
    throw new Error('❌ Required roles failed to generate during seeding.');
  }

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
  const librarianPermNames = [MUSIC_VIEW_ALL, MUSIC_CREATE, MUSIC_EDIT, MUSIC_DELETE, MUSIC_UPLOAD, MUSIC_DOWNLOAD_ALL];
  for (const permName of librarianPermNames) {
    const perm = allPermissions.find((p) => p.name === permName);
    if (perm) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: librarianRole.id, permissionId: perm.id } },
        update: {},
        create: { roleId: librarianRole.id, permissionId: perm.id },
      });
    }
  }

  // Musician permissions
  const musicianPermNames = [MUSIC_VIEW_ASSIGNED, MUSIC_DOWNLOAD_ASSIGNED, MEMBER_VIEW_OWN, MEMBER_EDIT_OWN, EVENT_VIEW_ALL, ATTENDANCE_MARK_OWN];
  for (const permName of musicianPermNames) {
    const perm = allPermissions.find((p) => p.name === permName);
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
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD as string;

  try {
    assertSuperAdminPasswordPresentForSeed();
  } catch (err: unknown) {
    console.error('❌ SUPER_ADMIN_PASSWORD is not set. For security, you must provide a password for the root SUPER_ADMIN user before running `npm run db:seed`.');
    console.error('   Add the following to your `.env` file (do NOT commit real passwords):');
    console.error('     SUPER_ADMIN_EMAIL="admin@eccb.org"');
    console.error('     SUPER_ADMIN_PASSWORD="your-secure-admin-password"');
    process.exit(1);
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({ 
    where: { email: adminEmail },
    include: { roles: true }
  });
  
  if (existingUser) {
    console.log(`✅ Admin user already exists: ${adminEmail}`);
    
    // Ensure the user has the super admin role
    const hasSuperAdminRole = existingUser.roles.some((ur) => ur.roleId === superAdminRole.id);
    
    if (!hasSuperAdminRole) {
      await prisma.userRole.create({
        data: { userId: existingUser.id, roleId: superAdminRole.id },
      });
      console.log('✅ Added SUPER_ADMIN role to existing user');
    }
    
    // Ensure member profile exists
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
      console.log('✅ Created member profile for admin user');
    }
  } else {
    try {
      console.log('Creating admin user via Better Auth...');
      const res = await auth.api.signUpEmail({
        body: {
          email: adminEmail,
          password: adminPassword,
          name: 'System Administrator',
        },
      });
      
      if (res.user) {
        await prisma.userRole.create({
          data: { userId: res.user.id, roleId: superAdminRole.id },
        });

        await prisma.member.create({
          data: {
            userId: res.user.id,
            firstName: 'System',
            lastName: 'Administrator',
            email: adminEmail,
            status: 'ACTIVE',
            joinDate: new Date(),
          },
        });
        
        console.log(`✅ Created Super Admin user: ${adminEmail}`);
      }
    } catch (error) {
      console.error('❌ Error creating admin user via Auth API:', error);
      throw error;
    }
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