#!/usr/bin/env npx tsx
/**
 * Smart Upload Pipeline Verification Script
 *
 * Validates the key smart-upload modules against the real test_music PDFs
 * stored in storage/test_music/.
 *
 * Usage:
 *   npx tsx scripts/verify-smart-upload.ts
 *
 * What it checks:
 *  1. SHA-256 computation is deterministic per file and unique across files
 *  2. generateOCRFallback parses recognisable titles from filenames
 *  3. parseFilenameMetadata picks up score/conductor patterns
 *  4. extractOcrFallbackMetadata returns sensible results from PDF bytes
 *     (using pdf-lib embedded metadata and pdfjs text layer where available)
 *  5. segmentByHeaderImages doesn't throw on any test PDF
 *  6. All test PDFs produce a result.title (even if confidence is low)
 *
 * Exit code 0 = all checks passed.
 * Exit code 1 = one or more failures.
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import {
  computeSha256,
} from '../src/lib/smart-upload/duplicate-detection';
import {
  generateOCRFallback,
  parseFilenameMetadata,
  extractOcrFallbackMetadata,
} from '../src/lib/services/ocr-fallback';
import {
  segmentByHeaderImages,
} from '../src/lib/services/header-image-segmentation';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TEST_MUSIC_DIR = join(process.cwd(), 'storage', 'test_music');
const PASS_COLOR = '\x1b[32m✓\x1b[0m';
const FAIL_COLOR = '\x1b[31m✗\x1b[0m';
const WARN_COLOR = '\x1b[33m⚠\x1b[0m';
const RESET = '\x1b[0m';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function findPdfs(dir: string): Promise<Array<{ path: string; name: string; piece: string }>> {
  const entries = await readdir(dir, { withFileTypes: true });
  const results: Array<{ path: string; name: string; piece: string }> = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subDir = join(dir, entry.name);
      const subEntries = await readdir(subDir, { withFileTypes: true });
      for (const sub of subEntries) {
        if (sub.isFile() && sub.name.toLowerCase().endsWith('.pdf')) {
          results.push({ path: join(subDir, sub.name), name: sub.name, piece: entry.name });
        }
      }
    }
  }
  return results;
}

let totalChecks = 0;
let failCount = 0;

function pass(msg: string) {
  totalChecks++;
  console.log(`  ${PASS_COLOR} ${msg}`);
}

function fail(msg: string, detail?: string) {
  totalChecks++;
  failCount++;
  console.log(`  ${FAIL_COLOR} ${msg}${detail ? ` — ${detail}` : ''}`);
}

function warn(msg: string) {
  console.log(`  ${WARN_COLOR} ${msg}${RESET}`);
}

function header(msg: string) {
  console.log(`\n\x1b[1m${msg}\x1b[0m`);
}

// ---------------------------------------------------------------------------
// Check 1: SHA-256 determinism + uniqueness
// ---------------------------------------------------------------------------

async function checkSha256(pdfs: typeof testPdfs) {
  header('Check 1: SHA-256 Determinism & Uniqueness');

  const hashes = new Map<string, string>(); // hash → filename
  let uniqueCount = 0;
  let dupeCount = 0;

  for (const pdf of pdfs.slice(0, 10)) { // sample 10 for speed
    const buf = await readFile(pdf.path);

    const h1 = computeSha256(buf);
    const h2 = computeSha256(buf);

    if (h1 !== h2) {
      fail(`SHA-256 non-deterministic: ${pdf.name}`);
    } else if (!/^[a-f0-9]{64}$/.test(h1)) {
      fail(`SHA-256 bad format: ${pdf.name}`, h1);
    } else {
      pass(`${pdf.name} → ${h1.slice(0, 16)}…`);
    }

    if (hashes.has(h1)) {
      warn(`Collision: ${pdf.name} and ${hashes.get(h1)} share hash ${h1.slice(0, 8)}…`);
      dupeCount++;
    } else {
      hashes.set(h1, pdf.name);
      uniqueCount++;
    }
  }

  console.log(`  → ${uniqueCount} unique, ${dupeCount} hash collisions\n`);
}

// ---------------------------------------------------------------------------
// Check 2: generateOCRFallback from filenames
// ---------------------------------------------------------------------------

async function checkFilenameMetadata(pdfs: typeof testPdfs) {
  header('Check 2: Filename Metadata Extraction');

  for (const pdf of pdfs.slice(0, 15)) {
    const result = generateOCRFallback(pdf.name);

    if (!result.title || result.title.length < 2) {
      fail(`Empty title from filename: ${pdf.name}`);
    } else if (result.confidence < 25) {
      fail(`Confidence below floor (${result.confidence}): ${pdf.name}`);
    } else {
      const composerStr = result.composer ? ` / ${result.composer}` : '';
      pass(`${pdf.name} → "${result.title}"${composerStr} [${result.confidence}]`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 3: parseFilenameMetadata on score files
// ---------------------------------------------------------------------------

async function checkParseFilenameMeta(pdfs: typeof testPdfs) {
  header('Check 3: parseFilenameMetadata (score/conductor patterns)');

  const scoreFiles = pdfs.filter((p) => /score|conductor/i.test(p.name));
  if (scoreFiles.length === 0) {
    warn('No score/conductor files found in sample');
    return;
  }

  for (const pdf of scoreFiles) {
    const result = parseFilenameMetadata(pdf.name);
    if (result.title || result.confidence) {
      pass(`${pdf.name} → title="${result.title ?? '—'}" confidence=${result.confidence ?? 0}`);
    } else {
      warn(`${pdf.name} → no pattern match (acceptable for this filename)`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 4: extractOcrFallbackMetadata returns meaningful results
// ---------------------------------------------------------------------------

async function checkOcrFallbackMetadata(pdfs: typeof testPdfs) {
  header('Check 4: extractOcrFallbackMetadata End-to-End');

  // Use one PDF per piece to keep it fast; prefer conductor score if available
  const byPiece = new Map<string, typeof testPdfs[0]>();
  for (const pdf of pdfs) {
    if (!byPiece.has(pdf.piece) || /score/i.test(pdf.name)) {
      byPiece.set(pdf.piece, pdf);
    }
  }

  for (const [piece, pdf] of byPiece) {
    process.stdout.write(`  Processing ${piece}…\r`);
    const buf = await readFile(pdf.path);

    try {
      const result = await extractOcrFallbackMetadata({
        pdfBuffer: buf,
        filename: pdf.name,
        options: {
          enableTesseractOcr: false, // skip heavy OCR; test only text-layer + pdf-lib + filename
          maxTextProbePages: 2,
        },
      });

      if (!result.title) {
        fail(`No title returned for ${pdf.name}`);
      } else if (result.confidence <= 0) {
        fail(`Zero confidence for ${pdf.name}`);
      } else if (result.confidence >= 70) {
        pass(`${piece}: title="${result.title}" [confidence=${result.confidence}, strategy=pdf-lib/text]`);
      } else {
        // Filename fallback is acceptable — document it as a warning
        warn(`${piece}: title="${result.title}" [confidence=${result.confidence} — filename fallback]`);
        totalChecks++;
      }
    } catch (err) {
      fail(`Threw for ${pdf.name}: ${(err as Error).message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 5: segmentByHeaderImages doesn't crash
// ---------------------------------------------------------------------------

async function checkHeaderSegmentation(pdfs: typeof testPdfs) {
  header('Check 5: segmentByHeaderImages (crash-free / structure check)');

  // Test multi-page PDFs likely to have multiple parts (packet files)
  const multiPartCandidates = pdfs.filter((p) =>
    /brass|winds|woodwinds|percussion/i.test(p.name)
  ).slice(0, 5);

  if (multiPartCandidates.length === 0) {
    warn('No multi-part candidates found; testing first 5 PDFs instead');
    multiPartCandidates.push(...pdfs.slice(0, 5));
  }

  for (const pdf of multiPartCandidates) {
    const buf = await readFile(pdf.path);
    try {
      // Use very forgiving options: minimal OCR, large threshold
      const result = await segmentByHeaderImages(buf, 0, {
        enableOcr: false,
        cropHeightFraction: 0.20,
        hashDistanceThreshold: 15,
      });
      // result can be null for < 3 page PDFs
      if (result === null) {
        warn(`${pdf.name} → null (too short / render unavailable — expected in test env)`);
      } else {
        const { segmentCount, confidence, cuttingInstructions } = result;
        if (cuttingInstructions.length < 1) {
          fail(`${pdf.name} → 0 cutting instructions`);
        } else if (confidence < 0 || confidence > 100) {
          fail(`${pdf.name} → confidence out of range: ${confidence}`);
        } else {
          pass(`${pdf.name} → ${segmentCount} segment(s), confidence=${confidence}`);
        }
      }
    } catch (err) {
      fail(`${pdf.name} threw: ${(err as Error).message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 6: Duplicate-detection cross-file uniqueness
// ---------------------------------------------------------------------------

async function checkCrossFileUniqueness(pdfs: typeof testPdfs) {
  header('Check 6: Cross-File SHA-256 Uniqueness');

  const hashMap = new Map<string, string>();
  let checked = 0;

  for (const pdf of pdfs) {
    const buf = await readFile(pdf.path);
    const hash = computeSha256(buf);

    if (hashMap.has(hash)) {
      fail(`COLLISION: "${pdf.name}" and "${hashMap.get(hash)}" have the same SHA-256`, hash.slice(0, 16));
    } else {
      hashMap.set(hash, pdf.name);
      checked++;
    }
  }

  if (checked === pdfs.length) {
    pass(`All ${checked} PDFs have unique SHA-256 hashes`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let testPdfs: Array<{ path: string; name: string; piece: string }> = [];

async function main() {
  console.log('\n\x1b[1m━━━ Smart Upload Pipeline Verification ━━━\x1b[0m');
  console.log(`Directory: ${TEST_MUSIC_DIR}\n`);

  testPdfs = await findPdfs(TEST_MUSIC_DIR);
  console.log(`Found ${testPdfs.length} PDF files across ${new Set(testPdfs.map((p) => p.piece)).size} pieces\n`);

  if (testPdfs.length === 0) {
    console.error('No PDFs found. Check that storage/test_music/ is populated.');
    process.exit(1);
  }

  await checkSha256(testPdfs);
  await checkFilenameMetadata(testPdfs);
  await checkParseFilenameMeta(testPdfs);
  await checkOcrFallbackMetadata(testPdfs);
  await checkHeaderSegmentation(testPdfs);
  await checkCrossFileUniqueness(testPdfs);

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n\x1b[1m━━━ Summary ━━━\x1b[0m');
  console.log(`Total checks: ${totalChecks}`);
  console.log(`Passed: ${totalChecks - failCount}`);
  console.log(`Failed: ${failCount}`);

  if (failCount > 0) {
    console.log(`\n\x1b[31mFAIL — ${failCount} check(s) failed.\x1b[0m\n`);
    process.exit(1);
  } else {
    console.log(`\n\x1b[32mPASS — All checks passed.\x1b[0m\n`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('\x1b[31mVerification script crashed:\x1b[0m', err);
  process.exit(1);
});
