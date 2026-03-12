const fs = require('fs');
const code = fs.readFileSync('src/app/(admin)/admin/members/actions.ts', 'utf8');

const target = `    // Assign role to users
    await prisma.$transaction(async (tx) => {
      // Create role assignments (upsert to avoid duplicates)
      for (const member of usersWithIds) {
        if (member.userId) {
          await tx.userRole.upsert({
            where: {
              userId_roleId: {
                userId: member.userId,
                roleId,
              },
            },
            update: {}, // No update needed if exists
            create: {
              userId: member.userId,
              roleId,
              assignedBy: session.user.id,
            },
          });
        }
      }
    });`;

const replacement = `    // Assign role to users
    // ⚡ Bolt: Prevent N+1 queries by using createMany with skipDuplicates instead of iterative upserts
    const roleAssignments = usersWithIds
      .filter((m) => m.userId)
      .map((m) => ({
        userId: m.userId as string,
        roleId,
        assignedBy: session.user.id,
      }));

    if (roleAssignments.length > 0) {
      await prisma.userRole.createMany({
        data: roleAssignments,
        skipDuplicates: true,
      });
    }`;

const newCode = code.replace(target, replacement);
if (newCode !== code) {
  fs.writeFileSync('src/app/(admin)/admin/members/actions.ts', newCode);
  console.log('Patched members/actions.ts successfully.');
} else {
  console.log('Target string not found!');
}
