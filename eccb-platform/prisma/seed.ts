import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient({
  log: ['query', 'error', 'warn']
})

async function main() {
  console.log('🌱 Seeding database...')

  // Create roles
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
      where: { name: 'MUSICIAN' },
      update: {},
      create: {
        name: 'MUSICIAN',
        displayName: 'Musician',
        type: 'MUSICIAN',
        description: 'Band member',
      },
    }),
  ])

  console.log(`✅ Created ${roles.length} roles`)

  // Create permissions
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
  ]

  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { name: perm.name },
      update: {},
      create: perm,
    })
  }

  console.log(`✅ Created ${permissions.length} permissions`)

  // Assign permissions to roles
  const superAdminRole = roles.find((r) => r.name === 'SUPER_ADMIN')!
  const librarianRole = roles.find((r) => r.name === 'LIBRARIAN')!
  const musicianRole = roles.find((r) => r.name === 'MUSICIAN')!

  // Super admin gets all permissions
  for (const perm of permissions) {
    const permission = await prisma.permission.findUnique({ where: { name: perm.name } })
    if (permission) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: superAdminRole.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: superAdminRole.id,
          permissionId: permission.id,
        },
      })
    }
  }

  // Librarian music permissions
  const librarianPerms = permissions.filter((p) => p.resource === 'music')
  for (const perm of librarianPerms) {
    const permission = await prisma.permission.findUnique({ where: { name: perm.name } })
    if (permission) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: librarianRole.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: librarianRole.id,
          permissionId: permission.id,
        },
      })
    }
  }

  // Musician limited permissions
  const musicianPerms = ['music.view.assigned', 'music.download.assigned', 'member.view.own', 'member.edit.own']
  for (const permName of musicianPerms) {
    const permission = await prisma.permission.findUnique({ where: { name: permName } })
    if (permission) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: musicianRole.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: musicianRole.id,
          permissionId: permission.id,
        },
      })
    }
  }

  // Create instruments
  const instruments = [
    // Woodwinds
    { name: 'Piccolo', family: 'Woodwind', sortOrder: 1 },
    { name: 'Flute', family: 'Woodwind', sortOrder: 2 },
    { name: 'Oboe', family: 'Woodwind', sortOrder: 3 },
    { name: 'Bassoon', family: 'Woodwind', sortOrder: 4 },
    { name: 'Eb Clarinet', family: 'Woodwind', sortOrder: 5 },
    { name: 'Bb Clarinet', family: 'Woodwind', sortOrder: 6 },
    { name: 'Bass Clarinet', family: 'Woodwind', sortOrder: 7 },
    { name: 'Alto Saxophone', family: 'Woodwind', sortOrder: 8 },
    { name: 'Tenor Saxophone', family: 'Woodwind', sortOrder: 9 },
    { name: 'Baritone Saxophone', family: 'Woodwind', sortOrder: 10 },
    
    // Brass
    { name: 'Trumpet', family: 'Brass', sortOrder: 20 },
    { name: 'Cornet', family: 'Brass', sortOrder: 21 },
    { name: 'French Horn', family: 'Brass', sortOrder: 22 },
    { name: 'Trombone', family: 'Brass', sortOrder: 23 },
    { name: 'Euphonium', family: 'Brass', sortOrder: 24 },
    { name: 'Tuba', family: 'Brass', sortOrder: 25 },
    
    // Percussion
    { name: 'Percussion', family: 'Percussion', sortOrder: 30 },
    { name: 'Timpani', family: 'Percussion', sortOrder: 31 },
  ]

  for (const inst of instruments) {
    await prisma.instrument.upsert({
      where: { name: inst.name },
      update: {},
      create: inst,
    })
  }

  console.log(`✅ Created ${instruments.length} instruments`)

  // Create sections
  const sections = [
    { name: 'Woodwinds', sortOrder: 1 },
    { name: 'Brass', sortOrder: 2 },
    { name: 'Percussion', sortOrder: 3 },
  ]

  for (const section of sections) {
    await prisma.section.upsert({
      where: { name: section.name },
      update: {},
      create: section,
    })
  }

  console.log(`✅ Created ${sections.length} sections`)

  // Create super admin user (if not exists)
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@eccb.org' },
    update: {},
    create: {
      email: 'admin@eccb.org',
      emailVerified: new Date(),
      name: 'System Administrator',
      password: await bcrypt.hash('ECCB@2024!', 12),
    },
  })

  console.log('✅ Created admin user:', adminUser.email)

  // Assign super admin role (using upsert to avoid duplicates)
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: superAdminRole.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: superAdminRole.id,
    },
  })

  console.log('✅ Created demo admin user: admin@eccb.org')

  console.log('🎉 Seeding complete!')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })