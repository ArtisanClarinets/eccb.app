import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getPdfSourceInfo } from '../pdf-source';
import { validatePdfBuffer } from '../pdf-splitter';

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

describe('pdf-source fixture coverage', () => {
  it('derives non-zero page counts for real storage/test_music PDFs', async () => {
    const fixtureFiles = (await collectFixturePdfs(TEST_MUSIC_DIR)).slice(0, 8);

    expect(fixtureFiles.length).toBeGreaterThan(0);

    for (const fixturePath of fixtureFiles) {
      const pdfBuffer = await readFile(fixturePath);
      const validation = await validatePdfBuffer(pdfBuffer);
      const sourceInfo = await getPdfSourceInfo(pdfBuffer);

      expect(validation.valid).toBe(true);
      expect(validation.pageCount).toBeGreaterThan(0);
      expect(sourceInfo.pageCount).toBeGreaterThan(0);
      expect(['pdf-lib', 'pdfjs']).toContain(sourceInfo.parser);
    }
  });
});
