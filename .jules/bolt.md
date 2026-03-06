## 2024-03-06 - Initial\n**Learning:** Just starting out.\n**Action:** Need to find something to optimize.
## 2024-03-06 - Smart Upload Counts Optimization\n**Learning:** Grouping by status using `prisma.groupBy` is more performant than executing multiple concurrent `prisma.count` queries, especially as the number of queried statuses increases, because it reduces the number of database connections and queries from O(N) to O(1).\n**Action:** Use `groupBy` over multiple concurrent `count` queries when fetching metrics grouped by categorical fields.

## 2024-03-05 - Vitest Transaction Mocking
**Learning:** When changing sequential database calls to `prisma.$transaction([])` arrays, Vitest test cases that stub `prisma.model.method` but not `prisma.$transaction` will fail with "is not a function".
**Action:** When introducing `prisma.$transaction` with arrays, mock it dynamically like: `vi.mocked(prisma.$transaction).mockImplementation(async (arg) => Array.isArray(arg) ? Promise.all(arg) : arg(prisma));` or globally in `vi.mock('@/lib/db')`
