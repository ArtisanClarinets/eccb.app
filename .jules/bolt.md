## 2024-03-06 - Initial\n**Learning:** Just starting out.\n**Action:** Need to find something to optimize.
## 2024-03-06 - Smart Upload Counts Optimization\n**Learning:** Grouping by status using `prisma.groupBy` is more performant than executing multiple concurrent `prisma.count` queries, especially as the number of queried statuses increases, because it reduces the number of database connections and queries from O(N) to O(1).\n**Action:** Use `groupBy` over multiple concurrent `count` queries when fetching metrics grouped by categorical fields.

## 2024-03-05 - Vitest Transaction Mocking
**Learning:** When changing sequential database calls to `prisma.$transaction([])` arrays, Vitest test cases that stub `prisma.model.method` but not `prisma.$transaction` will fail with "is not a function".
**Action:** When introducing `prisma.$transaction` with arrays, mock it dynamically like: `vi.mocked(prisma.$transaction).mockImplementation(async (arg) => Array.isArray(arg) ? Promise.all(arg) : arg(prisma));` or globally in `vi.mock('@/lib/db')`

## 2026-03-09 - N+1 Query Batching in Loops
**Learning:** When loops execute sequential `findUnique` followed by `update`/`create` operations (e.g. tracking assignments or user states), it exhausts the database connection pool via N+1 queries.
**Action:** Replace iterative database calls with a single bulk fetch (`findMany({ where: { id: { in: ids } } })`), filter in-memory, and use `validIds.flatMap(...)` to construct an array of `update`/`create` operations to pass into a single `prisma.$transaction(operations)`.

## 2026-03-11 - Optimize Admin Monitoring DB Stats
**Learning:** Found that `src/app/api/admin/monitoring/route.ts` was doing `prisma.event.findMany({ select: ... })` and fetching all rows into memory just to get lengths.
**Action:** Replaced `.findMany({ select: ... }).length` calls with `.count({ where: ... })` to push calculations to the database. This significantly improves memory footprint and API latency as the database grows.

## 2026-03-11 - Fix Prisma mock blocking test environment seeding
**Learning:** Found that checking `process.env.NODE_ENV === 'test'` inside `src/lib/db/index.ts` to provide an empty Prisma mock breaks database seeding during CI testing.
**Action:** Always constrain DB test mocking to explicitly the vitest runner (e.g. `process.env.VITEST`), because E2E tests and DB seeder scripts also execute with `NODE_ENV=test` but require a real client connection.

## 2026-03-11 - Next.js Build Needs Environment Secrets
**Learning:** Found that Next.js build runs in `NODE_ENV=production` by default and evaluates `src/lib/env.ts`, which mandates `SUPER_ADMIN_PASSWORD` and other secrets. If CI build actions do not provide them, the `npm run build` will fail.
**Action:** When adding new variables to `env.ts` or modifying GitHub actions, ensure dummy or explicit env variables (e.g. `SUPER_ADMIN_PASSWORD`) are passed into the `build` job's `.github/workflows/test.yml` `env` map.
