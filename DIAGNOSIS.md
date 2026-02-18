# Database Connection Error Diagnosis

## Error
```
Error occurred prerendering page "/directors"
prisma:error received invalid response: 6a
```

## Root Cause: Database Adapter Mismatch

The [`src/lib/db/index.ts`](src/lib/db/index.ts:1) file is using a **PostgreSQL adapter** with a **MySQL connection string**:

| Component | Current Value | Expected |
|-----------|--------------|----------|
| `prisma/schema.prisma` | `provider = "mysql"` | ✅ Correct |
| `.env DATABASE_URL` | `mysql://root:password@localhost:3306/eccb_dev` | ✅ Correct |
| `src/lib/db/index.ts` | Uses `PrismaPg` adapter + `pg` package | ❌ **Wrong - PostgreSQL adapter!** |

### The Problem
```typescript
// src/lib/db/index.ts (CURRENT - WRONG)
import { PrismaPg } from '@prisma/adapter-pg';  // PostgreSQL adapter
import pg from 'pg';                              // PostgreSQL client

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
```

When the PostgreSQL adapter tries to communicate with a MySQL/MariaDB server:
1. It sends PostgreSQL protocol messages
2. MySQL responds with MySQL protocol data
3. The `6a` byte is a MySQL protocol packet signature
4. Prisma throws "received invalid response: 6a"

## Proposed Fix

Update `src/lib/db/index.ts` to use the standard Prisma client without a custom adapter (Prisma's built-in MySQL driver works natively), OR use `@prisma/adapter-mysql` with `mysql2` package.

### Option 1: Standard Prisma Client (Recommended)
```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export * from '@prisma/client';
```

### Option 2: MySQL Adapter (if needed for connection pooling)
Would require installing `@prisma/adapter-mysql` and `mysql2` packages.

## Additional Cleanup Needed
- Remove `@prisma/adapter-pg` from package.json dependencies
- Remove `pg` and `@types/pg` from package.json dependencies
- Run `npx prisma generate` to regenerate the Prisma client for MySQL
