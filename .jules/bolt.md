
## 2024-03-05 - Vitest Transaction Mocking
**Learning:** When changing sequential database calls to `prisma.$transaction([])` arrays, Vitest test cases that stub `prisma.model.method` but not `prisma.$transaction` will fail with "is not a function".
**Action:** When introducing `prisma.$transaction` with arrays, mock it dynamically like: `vi.mocked(prisma.$transaction).mockImplementation(async (arg) => Array.isArray(arg) ? Promise.all(arg) : arg(prisma));` or globally in `vi.mock('@/lib/db')`
