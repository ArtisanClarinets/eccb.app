/**
 * verify-upload-review-preview.ts
 *
 * Smoke-test the renderPdfPageToImageWithInfo pipeline against real PDF files
 * from storage/test_music.  Exits with code 1 if any check fails.
 *
 * Usage:
 *   npx tsx scripts/verify-upload-review-preview.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const REPO_ROOT   = path.resolve(__dirname, '..');
const TEST_MUSIC  = path.join(REPO_ROOT, 'storage', 'test_music');
const MAX_FILES   = 3;
const RENDER_OPTS = { pageIndex: 0, scale: 3, maxWidth: 2000, format: 'png' as const, quality: 92, cacheTag: 'verify' };

// Thresholds for "this is real sheet music, not a blank/corrupted page"
const MIN_WIDTH    = 1200;  // px — a 2000px-wide render at scale 3 must be wide enough
const MIN_STDDEV   = 2;     // pixel std-dev — blank page ≈ 0, real content ≥ 5
const MAX_MEAN     = 250;   // pixel mean — a pure-white page = 255, real content < 250

// ---------------------------------------------------------------------------
// Discover PDFs
// ---------------------------------------------------------------------------
function findPdfs(dir: string, limit: number): string[] {
  const results: string[] = [];

  function walk(current: string): void {
    if (results.length >= limit) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= limit) break;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        results.push(full);
      }
    }
  }

  walk(dir);
  return results;
}

// ---------------------------------------------------------------------------
// Dynamic import of the renderer (avoids top-level await in TSX)
// ---------------------------------------------------------------------------
type RenderFn = (buf: Buffer, opts: typeof RENDER_OPTS) => Promise<{
  imageBase64: string;
  totalPages: number;
  mimeType: string;
  effective: { scale: number; wasClamped: boolean; width: number; height: number };
}>;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  // Dynamically load the renderer to avoid loading pdfjs/canvas at module scope
  // (which requires the Next.js environment setup done via tsconfig paths).
  let renderFn: RenderFn;
  try {
    const mod = await import('../src/lib/services/pdf-renderer');
    renderFn = mod.renderPdfPageToImageWithInfo as RenderFn;
  } catch (err) {
    console.error('FATAL: Could not import renderPdfPageToImageWithInfo:', err);
    process.exit(1);
  }

  const pdfs = findPdfs(TEST_MUSIC, MAX_FILES);
  if (pdfs.length === 0) {
    console.error(`FATAL: No PDF files found under ${TEST_MUSIC}`);
    process.exit(1);
  }

  console.log(`Found ${pdfs.length} PDF(s) to verify.\n`);

  let pass = 0;
  let fail = 0;

  for (const pdfPath of pdfs) {
    const label = path.relative(REPO_ROOT, pdfPath);
    process.stdout.write(`  Checking ${label} … `);

    let buffer: Buffer;
    try {
      buffer = fs.readFileSync(pdfPath);
    } catch (err) {
      console.log(`FAIL (read error: ${(err as Error).message})`);
      fail++;
      continue;
    }

    let result: Awaited<ReturnType<RenderFn>>;
    try {
      result = await renderFn(buffer, { ...RENDER_OPTS, cacheTag: `verify-${label.replace(/\W+/g, '-')}` });
    } catch (err) {
      console.log(`FAIL (render error: ${(err as Error).message})`);
      fail++;
      continue;
    }

    // Decode base64 → Buffer → sharp stats
    const imgBuffer = Buffer.from(result.imageBase64, 'base64');

    let stats: sharp.Stats;
    try {
      stats = await sharp(imgBuffer).stats();
    } catch (err) {
      console.log(`FAIL (sharp error: ${(err as Error).message})`);
      fail++;
      continue;
    }

    const { width, height } = result.effective;
    const mean   = stats.channels[0].mean;
    const stddev = stats.channels[0].stdev;

    const checks: Array<[boolean, string]> = [
      [result.totalPages >= 1,         `totalPages=${result.totalPages} (want ≥1)`],
      [result.imageBase64.length > 1000, `base64Length=${result.imageBase64.length} (want >1000)`],
      [result.mimeType === 'image/png', `mimeType=${result.mimeType} (want image/png)`],
      [width >= MIN_WIDTH,             `width=${width} (want ≥${MIN_WIDTH})`],
      [height >= 1,                    `height=${height} (want ≥1)`],
      [mean < MAX_MEAN,                `mean=${mean.toFixed(1)} (want <${MAX_MEAN})`],
      [stddev > MIN_STDDEV,            `stddev=${stddev.toFixed(2)} (want >${MIN_STDDEV})`],
    ];

    const failures = checks.filter(([ok]) => !ok).map(([, msg]) => msg);
    if (failures.length === 0) {
      console.log(`PASS (${width}×${height}, pages=${result.totalPages}, stddev=${stddev.toFixed(2)})`);
      pass++;
    } else {
      console.log(`FAIL`);
      for (const msg of failures) {
        console.log(`       ✗ ${msg}`);
      }
      fail++;
    }
  }

  console.log(`\nResults: ${pass} passed, ${fail} failed out of ${pdfs.length} file(s).`);
  if (fail > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
