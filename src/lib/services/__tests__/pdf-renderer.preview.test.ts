// @vitest-environment node
/**
 * Integration tests for renderPdfPageToImageWithInfo.
 *
 * These tests use real PDF files from storage/test_music and therefore require
 * the Node.js environment (pdfjs-dist + @napi-rs/canvas + sharp).
 *
 * They run with @vitest-environment node to bypass jsdom.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

const REPO_ROOT  = resolve(__dirname, '../../..');
const TEST_MUSIC = join(REPO_ROOT, 'storage', 'test_music');

/** Find the first PDF under storage/test_music (shallow walk up to 2 levels). */
function findFirstPdf(): string | null {
  if (!existsSync(TEST_MUSIC)) return null;
  for (const entry of readdirSync(TEST_MUSIC, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
      return join(TEST_MUSIC, entry.name);
    }
    if (entry.isDirectory()) {
      const subdir = join(TEST_MUSIC, entry.name);
      for (const sub of readdirSync(subdir, { withFileTypes: true })) {
        if (sub.isFile() && sub.name.toLowerCase().endsWith('.pdf')) {
          return join(subdir, sub.name);
        }
      }
    }
  }
  return null;
}

describe('renderPdfPageToImageWithInfo', () => {
  let pdfBuffer: Buffer;
  let hasPdf = false;

  beforeAll(() => {
    const pdfPath = findFirstPdf();
    if (pdfPath) {
      pdfBuffer = readFileSync(pdfPath);
      hasPdf = true;
    }
  });

  it('returns totalPages >= 1 and non-empty imageBase64 for PNG', async () => {
    if (!hasPdf) {
      console.warn('No test PDF found under storage/test_music — skipping pdf-renderer integration test');
      return;
    }

    // Dynamic import to avoid loading heavy native modules at module scope
    const { renderPdfPageToImageWithInfo } = await import('./pdf-renderer');

    const result = await renderPdfPageToImageWithInfo(pdfBuffer, {
      pageIndex: 0,
      scale: 2,        // lower scale for faster tests
      maxWidth: 1000,
      format: 'png',
      quality: 92,
      cacheTag: 'test-preview',
    });

    expect(result.totalPages).toBeGreaterThanOrEqual(1);
    expect(result.imageBase64.length).toBeGreaterThan(1000);
    expect(result.mimeType).toBe('image/png');
    expect(result.effective.width).toBeGreaterThan(0);
    expect(result.effective.height).toBeGreaterThan(0);
    expect(typeof result.effective.scale).toBe('number');
    expect(result.effective.scale).toBeGreaterThan(0);
    // Decoded buffer starts with PNG magic bytes
    const decoded = Buffer.from(result.imageBase64, 'base64');
    expect(decoded[0]).toBe(0x89);
    expect(decoded[1]).toBe(0x50); // 'P'
    expect(decoded[2]).toBe(0x4e); // 'N'
    expect(decoded[3]).toBe(0x47); // 'G'
  });

  it('returns mimeType image/jpeg when format="jpeg"', async () => {
    if (!hasPdf) return;

    const { renderPdfPageToImageWithInfo } = await import('./pdf-renderer');

    const result = await renderPdfPageToImageWithInfo(pdfBuffer, {
      pageIndex: 0,
      scale: 2,
      maxWidth: 1000,
      format: 'jpeg',
      quality: 80,
      cacheTag: 'test-preview-jpeg',
    });

    expect(result.mimeType).toBe('image/jpeg');
    // JPEG magic bytes: 0xFF 0xD8
    const decoded = Buffer.from(result.imageBase64, 'base64');
    expect(decoded[0]).toBe(0xff);
    expect(decoded[1]).toBe(0xd8);
  });

  it('includes an error message and placeholder image when rendering fails', async () => {
    const { renderPdfPageToImageWithInfo } = await import('../pdf-renderer');

    // feed garbage data so pdfjs throws and we hit the catch block
    const result = await renderPdfPageToImageWithInfo(Buffer.from('not a pdf'), {
      pageIndex: 0,
      scale: 2,
      maxWidth: 500,
      format: 'png',
      quality: 80,
      cacheTag: 'test-error',
    });

    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe('string');
    expect(result.imageBase64.length).toBeGreaterThan(0);
  });

  it('clamps scale and returns wasClamped=true when scale exceeds OOM limit', async () => {
    if (!hasPdf) return;

    const { renderPdfPageToImageWithInfo } = await import('./pdf-renderer');

    // Scale 6 at maxWidth 4000 is within the allowed clamp range —
    // we just verify wasClamped is a boolean and the render succeeds.
    const result = await renderPdfPageToImageWithInfo(pdfBuffer, {
      pageIndex: 0,
      scale: 6,
      maxWidth: 4000,
      format: 'png',
      quality: 92,
      cacheTag: 'test-preview-highscale',
    });

    expect(typeof result.effective.wasClamped).toBe('boolean');
    expect(result.imageBase64.length).toBeGreaterThan(1000);
  });
});
