
/**
 * Benchmark and Verification Script for Bulk Reject Optimization
 *
 * This script simulates the old (N+1) and new (batched) logic for bulk rejection
 * to verify performance improvements and functional correctness.
 */

const SESSIONS_COUNT = 100;
const COMMITTED_PERCENTAGE = 0.1;

// Setup test data
const sessionIds = Array.from({ length: SESSIONS_COUNT }, (_, i) => `session_${i}`);
const committedIds = new Set(
  sessionIds.slice(0, Math.floor(SESSIONS_COUNT * COMMITTED_PERCENTAGE))
);

// --- MOCK DATABASE ---
let queryCount = 0;

const mockPrisma = {
  musicFile: {
    findFirst: async ({ where }) => {
      queryCount++;
      return committedIds.has(where.originalUploadId) ? { id: 'file_id' } : null;
    },
    findMany: async ({ where }) => {
      queryCount++;
      const ids = where.originalUploadId.in;
      return ids
        .filter(id => committedIds.has(id))
        .map(id => ({ originalUploadId: id }));
    }
  },
  smartUploadSession: {
    update: async () => {
      queryCount++;
      return { status: 'REJECTED' };
    },
    updateMany: async () => {
      queryCount++;
      return { count: SESSIONS_COUNT * (1 - COMMITTED_PERCENTAGE) };
    }
  }
};

const cleanupSmartUploadTempFiles = async (id) => {
  // Simulate cleanup work
  return new Promise(resolve => setTimeout(resolve, 1));
};

// --- SIMULATE OLD LOGIC (N+1) ---
async function oldLogic(ids) {
  const start = Date.now();
  queryCount = 0;

  const rejected = [];
  const skipped = [];

  for (const id of ids) {
    // 1 query per session
    const alreadyCommitted = await mockPrisma.musicFile.findFirst({
      where: { originalUploadId: id }
    });

    if (alreadyCommitted) {
      skipped.push({ id, reason: 'Committed' });
      continue;
    }

    // 1 update per session
    await mockPrisma.smartUploadSession.update({
      where: { uploadSessionId: id },
      data: { status: 'REJECTED' }
    });

    rejected.push(id);

    // Sequential cleanup
    await cleanupSmartUploadTempFiles(id);
  }

  const duration = Date.now() - start;
  return { duration, queries: queryCount, rejected: rejected.length, skipped: skipped.length };
}

// --- SIMULATE NEW LOGIC (Batched) ---
async function newLogic(ids) {
  const start = Date.now();
  queryCount = 0;

  // 1 query for all committed
  const committedFiles = await mockPrisma.musicFile.findMany({
    where: { originalUploadId: { in: ids } }
  });

  const committedSet = new Set(committedFiles.map(f => f.originalUploadId));
  const toRejectIds = ids.filter(id => !committedSet.has(id));
  const skipped = ids.filter(id => committedSet.has(id)).map(id => ({ id, reason: 'Committed' }));

  if (toRejectIds.length > 0) {
    // 1 updateMany for all
    await mockPrisma.smartUploadSession.updateMany({
      where: { uploadSessionId: { in: toRejectIds } },
      data: { status: 'REJECTED' }
    });

    // Parallel cleanup
    await Promise.allSettled(toRejectIds.map(id => cleanupSmartUploadTempFiles(id)));
  }

  const duration = Date.now() - start;
  return { duration, queries: queryCount, rejected: toRejectIds.length, skipped: skipped.length };
}

async function run() {
  console.log(`--- Running Benchmark with ${SESSIONS_COUNT} sessions ---`);

  console.log('\nTesting Old Logic (N+1):');
  const oldResult = await oldLogic(sessionIds);
  console.log(oldResult);

  console.log('\nTesting New Logic (Batched):');
  const newResult = await newLogic(sessionIds);
  console.log(newResult);

  console.log('\n--- Results ---');
  console.log(`Query Reduction: ${oldResult.queries} -> ${newResult.queries} (${Math.round((1 - newResult.queries/oldResult.queries) * 100)}% improvement)`);
  console.log(`Time Reduction: ${oldResult.duration}ms -> ${newResult.duration}ms (${Math.round((1 - newResult.duration/oldResult.duration) * 100)}% improvement)`);

  // Verification
  if (oldResult.rejected === newResult.rejected && oldResult.skipped === newResult.skipped) {
    console.log('\n✅ Functional Parity Verified');
  } else {
    console.error('\n❌ Functional Parity Failed');
    process.exit(1);
  }
}

run();
