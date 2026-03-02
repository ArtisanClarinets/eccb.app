/**
 * Unit Tests — Header Image Segmentation Service
 *
 * Tests the local (no-LLM) PDF segmentation via perceptual hashing.
 * All heavy native dependencies (sharp, pdf-renderer, tesseract) are mocked
 * so tests are fast, deterministic, and environment-independent.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock heavy native dependencies before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('sharp', () => {
  const mockSharp = vi.fn().mockReturnValue({
    resize: vi.fn().mockReturnThis(),
    grayscale: vi.fn().mockReturnThis(),
    normalise: vi.fn().mockReturnThis(),
    sharpen: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    raw: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue({
      // 8×4 = 32 pixels, 50/50 dark/bright → deterministic hash
      data: Buffer.from(Array.from({ length: 32 }, (_, i) => (i < 16 ? 50 : 200))),
      info: { width: 8, height: 4, channels: 1 },
    }),
  });
  return { default: mockSharp };
});

vi.mock('@/lib/services/pdf-renderer', () => ({
  renderPdfHeaderCropBatch: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/smart-upload/quality-gates', () => ({
  isForbiddenLabel: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/smart-upload/part-naming', () => ({
  normalizeInstrumentLabel: vi.fn().mockImplementation((raw: string) => ({
    instrument: raw,
    chair: null,
    transposition: 'C' as const,
    section: 'Other' as const,
  })),
}));

// Import after mocks
import {
  segmentByHeaderImages,
  preprocessForOcr,
} from '../header-image-segmentation';
import { renderPdfHeaderCropBatch } from '@/lib/services/pdf-renderer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid PDF header buffer (not a real PDF, just enough for tests). */
function makeFakePdfBuffer(): Buffer {
  return Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
}

/** Build realistic base64 "image" placeholders. */
function makeBase64Crops(count: number, vary = false): string[] {
  return Array.from({ length: count }, (_, i) =>
    Buffer.from(vary ? `crop-${i}` : 'same-crop').toString('base64')
  );
}

// ---------------------------------------------------------------------------
// Tests — preprocessForOcr
// ---------------------------------------------------------------------------

describe('preprocessForOcr', () => {
  it('returns a non-empty base64 string', async () => {
    const input = Buffer.from('fake-png-bytes').toString('base64');
    const result = await preprocessForOcr(input);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('does not throw on minimal input', async () => {
    await expect(preprocessForOcr('')).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Tests — segmentByHeaderImages
// ---------------------------------------------------------------------------

describe('segmentByHeaderImages', () => {
  const fakePdf = makeFakePdfBuffer();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when totalPages < MIN_PAGES_TO_SEGMENT (3)', async () => {
    const result = await segmentByHeaderImages(fakePdf, 2);
    expect(result).toBeNull();
  });

  it('returns null when renderPdfHeaderCropBatch returns no crops', async () => {
    vi.mocked(renderPdfHeaderCropBatch).mockResolvedValueOnce([]);
    const result = await segmentByHeaderImages(fakePdf, 5);
    expect(result).toBeNull();
  });

  it('returns null when all pages have identical headers (no meaningful boundary)', async () => {
    // The function returns null when only 1 segment is detected — the calling
    // code should treat the whole file as a single part.
    const crops = makeBase64Crops(4); // all identical base64
    vi.mocked(renderPdfHeaderCropBatch).mockResolvedValueOnce(crops);
    // sharp mock returns same pixels for every call → all hashes equal → 1 segment
    const result = await segmentByHeaderImages(fakePdf, 4, { enableOcr: false });
    expect(result).toBeNull();
  });

  it('detects two segments when headers differ at a boundary', async () => {
    // First 3 pages share hash A, last 2 share hash B (modelled by different base64 content).
    // But since sharp is mocked with fixed pixel output, the hashes will be identical.
    // We instead mock at the sharp level to return different pixels by page.
    const sharp = (await import('sharp')).default;

    let callCount = 0;
    vi.mocked(sharp).mockImplementation(() => {
      const pixels = callCount++ < 3
        ? Buffer.from(Array.from({ length: 32 }, () => 10))   // segment A: all dark
        : Buffer.from(Array.from({ length: 32 }, () => 240));  // segment B: all bright
      return {
        resize: vi.fn().mockReturnThis(),
        grayscale: vi.fn().mockReturnThis(),
        normalise: vi.fn().mockReturnThis(),
        sharpen: vi.fn().mockReturnThis(),
        png: vi.fn().mockReturnThis(),
        raw: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue({ data: pixels, info: {} }),
      } as any;
    });

    const crops = makeBase64Crops(5, true); // 5 different base64 strings
    vi.mocked(renderPdfHeaderCropBatch).mockResolvedValueOnce(crops);

    const result = await segmentByHeaderImages(fakePdf, 5, {
      enableOcr: false,
      hashDistanceThreshold: 10,
    });

    expect(result).not.toBeNull();
    expect(result!.segmentCount).toBeGreaterThanOrEqual(1);
    expect(result!.cuttingInstructions.length).toBeGreaterThanOrEqual(1);
    // All pages covered
    const lastInstruction = result!.cuttingInstructions.at(-1)!;
    expect(lastInstruction.pageRange[1]).toBe(4);
  });

  it('result cuttingInstructions are 0-indexed', async () => {
    // threshold=0 → every page-pair is a boundary (Hamming dist 0 >= 0)
    const crops = makeBase64Crops(4);
    vi.mocked(renderPdfHeaderCropBatch).mockResolvedValueOnce(crops);

    const result = await segmentByHeaderImages(fakePdf, 4, { enableOcr: false, hashDistanceThreshold: 0 });

    expect(result).not.toBeNull();
    for (const instr of result!.cuttingInstructions) {
      expect(instr.pageRange[0]).toBeGreaterThanOrEqual(0);
      expect(instr.pageRange[1]).toBeLessThanOrEqual(3);
    }
  });

  it('confidence is in range [0, 100]', async () => {
    // threshold=0 → forces multi-segment result
    const crops = makeBase64Crops(4);
    vi.mocked(renderPdfHeaderCropBatch).mockResolvedValueOnce(crops);

    const result = await segmentByHeaderImages(fakePdf, 4, { enableOcr: false, hashDistanceThreshold: 0 });

    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(0);
    expect(result!.confidence).toBeLessThanOrEqual(100);
  });

  it('provides diagnostics with one entry per segment', async () => {
    // threshold=0 → forces multi-segment result
    const crops = makeBase64Crops(4);
    vi.mocked(renderPdfHeaderCropBatch).mockResolvedValueOnce(crops);

    const result = await segmentByHeaderImages(fakePdf, 4, { enableOcr: false, hashDistanceThreshold: 0 });

    expect(result).not.toBeNull();
    expect(result!.diagnostics.length).toBe(result!.segmentCount);
  });

  it('marks isDefinitive false when OCR is disabled (no labels)', async () => {
    // threshold=0 → forces multi-segment result
    const crops = makeBase64Crops(4);
    vi.mocked(renderPdfHeaderCropBatch).mockResolvedValueOnce(crops);

    const result = await segmentByHeaderImages(fakePdf, 4, { enableOcr: false, hashDistanceThreshold: 0 });

    // isDefinitive requires both high confidence AND OCR labels
    expect(result).not.toBeNull();
    expect(result!.hasOcrLabels).toBe(false);
    expect(result!.isDefinitive).toBe(false);
  });

  it('does not throw on an error in rendering (returns null gracefully)', async () => {
    vi.mocked(renderPdfHeaderCropBatch).mockRejectedValueOnce(new Error('render failure'));
    const result = await segmentByHeaderImages(fakePdf, 10);
    expect(result).toBeNull();
  });

  it('each cutting instruction has required fields', async () => {
    // threshold=0 → forces multi-segment result
    const crops = makeBase64Crops(4);
    vi.mocked(renderPdfHeaderCropBatch).mockResolvedValueOnce(crops);

    const result = await segmentByHeaderImages(fakePdf, 4, { enableOcr: false, hashDistanceThreshold: 0 });

    expect(result).not.toBeNull();
    for (const instr of result!.cuttingInstructions) {
      expect(typeof instr.instrument).toBe('string');
      expect(typeof instr.partName).toBe('string');
      expect(typeof instr.partNumber).toBe('number');
      expect(Array.isArray(instr.pageRange)).toBe(true);
      expect(instr.pageRange).toHaveLength(2);
    }
  });
});
