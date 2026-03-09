#!/usr/bin/env npx tsx
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { getPdfSourceInfo } from '../src/lib/services/pdf-source';
import { validatePdfBuffer } from '../src/lib/services/pdf-splitter';
import { extractOcrFallbackMetadata } from '../src/lib/services/ocr-fallback';

const TEST_MUSIC_DIR = path.join(process.cwd(), 'storage', 'test_music');

async function collectFixturePdfs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFixturePdfs(entryPath)));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
      files.push(entryPath);
    }
  }

  return files;
}

async function main() {
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 10;
  const allFiles = await collectFixturePdfs(TEST_MUSIC_DIR);
  const fixtureFiles = allFiles.slice(0, Number.isFinite(limit) ? limit : 10);

  if (fixtureFiles.length === 0) {
    throw new Error('No fixture PDFs found under storage/test_music');
  }

  console.log(`Checking ${fixtureFiles.length} Smart Upload fixture PDFs`);

  for (const fixturePath of fixtureFiles) {
    const pdfBuffer = await readFile(fixturePath);
    const validation = await validatePdfBuffer(pdfBuffer);
    const sourceInfo = await getPdfSourceInfo(pdfBuffer);
    const metadata = await extractOcrFallbackMetadata({
      pdfBuffer,
      filename: path.basename(fixturePath),
      options: {
        enableTesseractOcr: false,
        maxTextProbePages: 2,
      },
    });

    console.log(
      [
        path.relative(process.cwd(), fixturePath),
        `valid=${validation.valid}`,
        `pages=${sourceInfo.pageCount}`,
        `parser=${sourceInfo.parser}`,
        `title=${metadata.title || 'n/a'}`,
        `confidence=${metadata.confidence}`,
      ].join(' | ')
    );

    if (!validation.valid || sourceInfo.pageCount <= 0 || !metadata.title) {
      throw new Error(`Fixture verification failed for ${fixturePath}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
