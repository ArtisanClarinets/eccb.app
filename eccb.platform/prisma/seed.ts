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