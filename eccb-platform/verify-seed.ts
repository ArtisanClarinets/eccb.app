import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifySeedData() {
  console.log('🔍 Verifying seed data...');

  try {
    // Verify roles exist
    const roles = await prisma.role.findMany();
    console.log(`✅ Found ${roles.length} roles`);
    if (roles.length > 0) {
      console.log('   - Roles:', roles.map(r => r.name).join(', '));
    }

    // Verify permissions exist
    const permissions = await prisma.permission.findMany();
    console.log(`✅ Found ${permissions.length} permissions`);

    // Verify instruments exist
    const instruments = await prisma.instrument.findMany();
    console.log(`✅ Found ${instruments.length} instruments`);
    if (instruments.length > 0) {
      console.log('   - Instruments by family:', 
        [...new Set(instruments.map(i => i.family))].join(', '));
    }

    // Verify sections exist
    const sections = await prisma.section.findMany();
    console.log(`✅ Found ${sections.length} sections`);
    if (sections.length > 0) {
      console.log('   - Sections:', sections.map(s => s.name).join(', '));
    }

    // Verify admin user exists
    const adminUser = await prisma.user.findUnique({
      where: { email: 'admin@eccb.org' },
      include: { roles: { include: { role: true } } }
    });
    
    if (adminUser) {
      console.log(`✅ Found admin user: ${adminUser.email}`);
      if (adminUser.roles.length > 0) {
        console.log('   - Roles:', adminUser.roles.map(ur => ur.role.name).join(', '));
      }
    } else {
      console.log('❌ Admin user not found');
    }

    console.log('\n🎉 All seed data verified successfully!');
  } catch (error) {
    console.error('❌ Error verifying seed data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifySeedData();
