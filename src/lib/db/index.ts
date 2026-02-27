import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

/**
 * Parse a mysql:// or mariadb:// DATABASE_URL into individual connection
 * parameters, correctly stripping any query-string parameters from the
 * database name so the MariaDB driver receives a clean identifier.
 */
function parseDatabaseUrlForAdapter(url?: string) {
  if (!url) return null;
  try {
    // Normalise mariadb:// → mysql:// so the built-in URL parser accepts it
    const normalised = url.replace(/^mariadb:\/\//, 'mysql://');
    const parsed = new URL(normalised);

    if (!parsed.protocol.startsWith('mysql')) return null;

    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 3306,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      // pathname starts with '/', e.g. '/eccb_dev' — strip the leading slash
      database: parsed.pathname.replace(/^\//, ''),
    };
  } catch {
    return null;
  }
}

/**
 * During a production build Next.js spawns up to 27 worker threads, each
 * creating their own Prisma client.  Limit each worker to 1 MariaDB
 * connection so the build doesn't exhaust the server's connection pool
 * (default pool limit is 10).
 */
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
const CONNECTION_LIMIT = isBuildPhase ? 1 : 10;

let prisma: PrismaClient;

if (process.env.NODE_ENV === 'test') {
  // During tests we typically mock out prisma methods, so we avoid
  // instantiating the real client which currently requires an adapter
  // or accelerateUrl when the DATABASE_URL is missing.  Return an empty
  // object cast to PrismaClient; individual test files should mock
  // the methods they rely on.
  prisma = {} as PrismaClient;
} else {
  const dbCfg = parseDatabaseUrlForAdapter(process.env.DATABASE_URL);
  const adapter = dbCfg
    ? new PrismaMariaDb({
        host: dbCfg.host,
        port: dbCfg.port,
        user: dbCfg.user,
        password: dbCfg.password,
        database: dbCfg.database,
        connectionLimit: CONNECTION_LIMIT,
      })
    : undefined;

  prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
      ...(adapter ? { adapter } : {}),
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  // cache singleton
  globalForPrisma.prisma = prisma;
}

export { prisma };
// In all environments, cache the singleton on globalThis so that module
// re-evaluation (HMR in dev, multiple module instances in build workers)
// always reuses the same client and connection pool.
globalForPrisma.prisma = prisma;
