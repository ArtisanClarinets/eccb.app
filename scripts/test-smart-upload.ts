/**
 * Smart Upload Integration Test Script
 *
 * Tests the OCR-first smart upload pipeline end-to-end by:
 * 1. Reading PDF files from test_music/ directory
 * 2. Creating SmartUploadSession records in the DB
 * 3. Copying PDFs to local storage
 * 4. Queuing smart upload process jobs
 * 5. Monitoring until all jobs complete
 *
 * Usage: npx tsx scripts/test-smart-upload.ts [--files file1.pdf file2.pdf ...]
 *        npx tsx scripts/test-smart-upload.ts --all     (processes all PDFs in test_music/)
 */

import 'dotenv/config';
import { randomUUID } from 'crypto';
import { readFile, mkdir, copyFile, access, readdir } from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prisma + queue imports
import { prisma } from '@/lib/db';
import { initializeQueues, getQueue } from '@/lib/jobs/queue';
import { SMART_UPLOAD_JOB_NAMES } from '@/lib/jobs/smart-upload';
import { startSmartUploadProcessorWorker, stopSmartUploadProcessorWorker } from '@/workers/smart-upload-processor-worker';
import { logger } from '@/lib/logger';
import { bootstrapSmartUploadSettings } from '@/lib/smart-upload/bootstrap';

// =============================================================================
// Configuration
// =============================================================================

const TEST_MUSIC_DIR = path.resolve(__dirname, '..', 'storage', 'smart-upload', 'test_music');
const STORAGE_DIR = path.resolve(__dirname, '..', 'storage', 'smart-upload');
const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_MS = 5 * 60 * 1000; // 5 minutes max per file

// =============================================================================
// Helpers
// =============================================================================

function computeSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

interface TestSession {
  sessionId: string;
  fileName: string;
  filePath: string;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  let pdfFiles: string[] = [];
  
  if (args.includes('--all') || args.length === 0) {
    // Find all PDFs in test_music/
    const entries = await readdir(TEST_MUSIC_DIR).catch(() => []);
    pdfFiles = (entries as string[])
      .filter((f: string) => f.toLowerCase().endsWith('.pdf'))
      .map((f: string) => path.join(TEST_MUSIC_DIR, f));
  } else if (args.includes('--files')) {
    const fileIdx = args.indexOf('--files');
    pdfFiles = args.slice(fileIdx + 1).map((f) => 
      path.isAbsolute(f) ? f : path.resolve(process.cwd(), f)
    );
  } else {
    // Treat all args as file paths
    pdfFiles = args.map((f) => 
      path.isAbsolute(f) ? f : path.resolve(process.cwd(), f)
    );
  }

  if (pdfFiles.length === 0) {
    console.error('No PDF files found. Place PDFs in test_music/ or pass --files <path>');
    process.exit(1);
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('Smart Upload Integration Test');
  console.log(`${'='.repeat(70)}`);
  console.log(`Files to process: ${pdfFiles.length}`);
  for (const f of pdfFiles) {
    console.log(`  - ${path.basename(f)}`);
  }
  console.log();

  // 1. Bootstrap settings
  console.log('[1/5] Bootstrapping Smart Upload settings...');
  await bootstrapSmartUploadSettings();
  console.log('  ✓ Settings bootstrapped\n');

  // 2. Initialize queues
  console.log('[2/5] Initializing queues...');
  initializeQueues();
  console.log('  ✓ Queues initialized\n');

  // 3. Start the worker
  console.log('[3/5] Starting Smart Upload worker...');
  await startSmartUploadProcessorWorker();
  console.log('  ✓ Worker started\n');

  // 4. Create sessions and queue jobs
  console.log('[4/5] Creating sessions and queueing jobs...');
  const sessions: TestSession[] = [];

  for (const filePath of pdfFiles) {
    const fileName = path.basename(filePath);
    
    // Check file exists
    if (!(await fileExists(filePath))) {
      console.error(`  ✗ File not found: ${filePath}`);
      continue;
    }

    const pdfBuffer = await readFile(filePath);
    const sessionId = randomUUID();
    const storageKey = `smart-upload/${sessionId}/original.pdf`;
    const storagePath = path.join(STORAGE_DIR, sessionId, 'original.pdf');
    const sha256 = computeSha256(pdfBuffer);

    // Create storage directory and copy file
    await mkdir(path.dirname(storagePath), { recursive: true });
    await copyFile(filePath, storagePath);

    // Create DB session
    await prisma.smartUploadSession.create({
      data: {
        uploadSessionId: sessionId,
        fileName,
        fileSize: pdfBuffer.length,
        mimeType: 'application/pdf',
        storageKey,
        extractedMetadata: {
          title: fileName.replace(/\.pdf$/i, ''),
          confidenceScore: 0,
          sourceSha256: sha256,
        },
        confidenceScore: 0,
        status: 'PENDING_REVIEW',
        uploadedBy: 'system:test-script',
        parseStatus: 'NOT_PARSED',
        secondPassStatus: 'NOT_NEEDED',
        autoApproved: false,
      },
    });

    // Queue the job
    const queue = getQueue('SMART_UPLOAD');
    if (!queue) throw new Error('Queue not available');

    await queue.add(
      SMART_UPLOAD_JOB_NAMES.PROCESS,
      { sessionId, fileId: sessionId },
      {
        priority: 5,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: false,
      }
    );

    sessions.push({ sessionId, fileName, filePath });
    console.log(`  ✓ Queued: ${fileName} (session: ${sessionId})`);
  }

  console.log(`\n  Total queued: ${sessions.length}\n`);

  // 5. Monitor jobs until completion
  console.log('[5/5] Monitoring processing...\n');
  
  const results = new Map<string, {
    status: string;
    parseStatus: string;
    confidence: number;
    partsCreated: number;
    routingDecision: string | null;
    error?: string;
    ocrFirstUsed: boolean;
  }>();

  const startTime = Date.now();
  let allDone = false;

  while (!allDone && (Date.now() - startTime) < MAX_WAIT_MS) {
    allDone = true;

    for (const session of sessions) {
      if (results.has(session.sessionId) && 
          ['PARSED', 'PARSE_FAILED'].includes(results.get(session.sessionId)!.parseStatus)) {
        continue; // Already done
      }

      const dbSession = await prisma.smartUploadSession.findUnique({
        where: { uploadSessionId: session.sessionId },
      });

      if (!dbSession) {
        results.set(session.sessionId, {
          status: 'ERROR',
          parseStatus: 'NOT_FOUND',
          confidence: 0,
          partsCreated: 0,
          routingDecision: null,
          error: 'Session not found in DB',
          ocrFirstUsed: false,
        });
        continue;
      }

      const parseStatus = dbSession.parseStatus || 'NOT_PARSED';
      const metadata = dbSession.extractedMetadata as Record<string, unknown> | null;
      const parsedParts = dbSession.parsedParts as unknown[] | null;
      const notes = metadata?.notes as string | undefined;
      const ocrFirstUsed = notes?.includes('OCR-first pipeline') ?? false;

      if (parseStatus === 'PARSED' || parseStatus === 'PARSE_FAILED') {
        results.set(session.sessionId, {
          status: dbSession.status || 'UNKNOWN',
          parseStatus,
          confidence: dbSession.confidenceScore || 0,
          partsCreated: parsedParts?.length ?? 0,
          routingDecision: dbSession.routingDecision || null,
          ocrFirstUsed,
        });

        const icon = parseStatus === 'PARSED' ? '✓' : '✗';
        const pipeline = ocrFirstUsed ? 'OCR-FIRST' : 'LLM';
        console.log(
          `  ${icon} ${session.fileName}: ${parseStatus} | ` +
          `confidence=${dbSession.confidenceScore} | ` +
          `parts=${parsedParts?.length ?? 0} | ` +
          `routing=${dbSession.routingDecision} | ` +
          `pipeline=${pipeline}`
        );
      } else {
        allDone = false;
      }
    }

    if (!allDone) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const pending = sessions.length - results.size;
      process.stdout.write(`  ... waiting (${elapsed}s elapsed, ${pending} pending)\r`);
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  // Print summary
  console.log(`\n\n${'='.repeat(70)}`);
  console.log('RESULTS SUMMARY');
  console.log(`${'='.repeat(70)}`);

  let successCount = 0;
  let failCount = 0;

  for (const session of sessions) {
    const result = results.get(session.sessionId);
    if (!result) {
      console.log(`  ✗ ${session.fileName}: TIMEOUT (no result after ${MAX_WAIT_MS / 1000}s)`);
      failCount++;
      continue;
    }

    // Print detail
    const dbSession = await prisma.smartUploadSession.findUnique({
      where: { uploadSessionId: session.sessionId },
    });

    const metadata = dbSession?.extractedMetadata as Record<string, unknown> | null;
    const cutting = (metadata?.cuttingInstructions as Array<{ partName: string; instrument: string; pageRange: number[] }>) || [];

    console.log(`\n  📄 ${session.fileName}`);
    console.log(`     Session:    ${session.sessionId}`);
    console.log(`     Status:     ${result.parseStatus}`);
    console.log(`     Pipeline:   ${result.ocrFirstUsed ? 'OCR-FIRST (no LLM)' : 'LLM fallback'}`);
    console.log(`     Confidence: ${result.confidence}`);
    console.log(`     Routing:    ${result.routingDecision}`);
    console.log(`     Title:      ${metadata?.title || 'N/A'}`);
    console.log(`     Composer:   ${metadata?.composer || 'N/A'}`);
    console.log(`     Parts:      ${result.partsCreated}`);
    
    if (cutting.length > 0) {
      console.log(`     Cutting Instructions:`);
      for (const ci of cutting) {
        console.log(`       - ${ci.partName} (${ci.instrument}) pages ${ci.pageRange?.[0]}–${ci.pageRange?.[1]}`);
      }
    }

    if (result.parseStatus === 'PARSED' && result.partsCreated > 0) {
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`Total: ${sessions.length} | Success: ${successCount} | Failed: ${failCount}`);
  console.log(`${'='.repeat(70)}\n`);

  // Cleanup
  console.log('Stopping worker...');
  await stopSmartUploadProcessorWorker();
  await prisma.$disconnect();
  
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
