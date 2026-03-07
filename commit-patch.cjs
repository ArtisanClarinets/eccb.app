const fs = require('fs');

const file = 'src/app/api/admin/uploads/review/route.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/const \[pendingCount, approvedCount, rejectedCount\] = await Promise\.all\(\[\n\s*prisma\.smartUploadSession\.count\(\{ where: \{ status: 'PENDING_REVIEW' \} \}\),\n\s*prisma\.smartUploadSession\.count\(\{ where: \{ status: 'APPROVED' \} \}\),\n\s*prisma\.smartUploadSession\.count\(\{ where: \{ status: 'REJECTED' \} \}\),\n\s*\]\);/g,
  `const counts = await prisma.smartUploadSession.groupBy({
      by: ['status'],
      where: { status: { in: ['PENDING_REVIEW', 'APPROVED', 'REJECTED'] } },
      _count: { _all: true },
    });

    const pendingCount = counts.find((c) => c.status === 'PENDING_REVIEW')?._count._all ?? 0;
    const approvedCount = counts.find((c) => c.status === 'APPROVED')?._count._all ?? 0;
    const rejectedCount = counts.find((c) => c.status === 'REJECTED')?._count._all ?? 0;`);

fs.writeFileSync(file, code);
