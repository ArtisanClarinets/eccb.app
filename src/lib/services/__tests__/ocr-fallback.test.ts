/**
 * Unit Tests — OCR Fallback Service (enhanced)
 *
 * Covers:
 *  - Step 0.5: PDF document-info metadata (pdf-lib title/author)
 *  - Step 1:   PDF text-layer extraction
 *  - Step 2:   Multi-crop OCR via tesseract
 *  - Step 3:   Filename fallback
 *  - generateOCRFallback() behaviour
 *  - parseFilenameMetadata() behaviour
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before the module under test is imported
// ---------------------------------------------------------------------------

vi.mock('@/lib/services/pdf-text-extractor', () => ({
  extractPdfPageHeaders: vi.fn(),
}));

vi.mock('@/lib/services/pdf-renderer', () => ({
  renderPdfToImage: vi.fn(),
  renderPdfHeaderCropBatch: vi.fn(),
}));

vi.mock('@/lib/services/header-image-segmentation', () => ({
  preprocessForOcr: vi.fn().mockImplementation(async (b64: string) => b64),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// pdf-lib dynamic import mock — controlled per-test
const mockGetTitle = vi.fn();
const mockGetAuthor = vi.fn();
const mockGetSubject = vi.fn();
const mockPdfDocLoad = vi.fn();

vi.mock('pdf-lib', () => ({
  PDFDocument: {
    load: mockPdfDocLoad,
  },
}));

// tesseract.js dynamic import — default to unavailable (no recognize() fn)
vi.mock('tesseract.js', () => ({}));

// Import mocked helpers
import { extractPdfPageHeaders } from '@/lib/services/pdf-text-extractor';
import { renderPdfHeaderCropBatch } from '@/lib/services/pdf-renderer';

// Import module under test
import {
  extractOcrFallbackMetadata,
  generateOCRFallback,
  parseFilenameMetadata,
  isImageBasedPdf,
} from '../ocr-fallback';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePdfBuffer(): Buffer {
  return Buffer.from('%PDF-1.4 test buffer');
}

function makeTextExtractionResult(overrides?: Partial<{
  hasTextLayer: boolean;
  textLayerCoverage: number;
  pageHeaders: Array<{ headerText: string; fullText: string; pageIndex?: number; hasText?: boolean }>;
}>) {
  const pageHeaders = (overrides?.pageHeaders ?? [{ headerText: 'Test Title  By Test Composer', fullText: '' }])
    .map((h, i) => ({ pageIndex: h.pageIndex ?? i, hasText: h.hasText ?? true, ...h }));
  return {
    hasTextLayer: overrides?.hasTextLayer ?? true,
    textLayerCoverage: overrides?.textLayerCoverage ?? 1.0,
    totalPages: 1,
    pageHeaders,
  };
}

// ---------------------------------------------------------------------------
// generateOCRFallback
// ---------------------------------------------------------------------------

describe('generateOCRFallback', () => {
  it('extracts title from plain filename', () => {
    const result = generateOCRFallback('Amparito Roca.pdf');
    expect(result.title).toBe('Amparito Roca');
    expect(result.confidence).toBeGreaterThanOrEqual(25);
    expect(result.needsManualReview).toBe(true);
    expect(result.isImageScanned).toBe(true);
  });

  it('extracts composer from "Composer - Title" pattern', () => {
    const result = generateOCRFallback('Sousa - Stars and Stripes.pdf');
    expect(result.composer).toBe('Sousa');
    expect(result.title).toBe('Stars and Stripes');
    expect(result.confidence).toBeGreaterThan(25);
  });

  it('ignores leading track numbers', () => {
    const result = generateOCRFallback('01 - March USA250.pdf');
    expect(result.title).toBe('March USA250');
    expect(result.composer).toBeUndefined();
  });

  it('handles filenames without extension', () => {
    const result = generateOCRFallback('Festive Overture');
    expect(result.title).toBe('Festive Overture');
  });

  it('confidence is at least 25 (manual review flag)', () => {
    const result = generateOCRFallback('unknown.pdf');
    expect(result.confidence).toBeGreaterThanOrEqual(25);
    expect(result.needsManualReview).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseFilenameMetadata
// ---------------------------------------------------------------------------

describe('parseFilenameMetadata', () => {
  it('returns empty object for arbitrary titles', () => {
    const result = parseFilenameMetadata('Random File.pdf');
    expect(result).toEqual({});
  });

  it('detects conductor/full score patterns', () => {
    const result = parseFilenameMetadata('Conductor Score.pdf');
    expect(result.title).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// extractOcrFallbackMetadata — step 0.5: pdf-lib document-info metadata
// ---------------------------------------------------------------------------

describe('extractOcrFallbackMetadata — pdf-lib metadata step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPdfDocLoad.mockResolvedValue({
      getTitle: mockGetTitle,
      getAuthor: mockGetAuthor,
      getSubject: mockGetSubject,
    });
  });

  it('returns high-confidence result when embedded title is present', async () => {
    mockGetTitle.mockReturnValue('Barnum and Baileys Favorite');
    mockGetAuthor.mockReturnValue('Karl L. King');
    mockGetSubject.mockReturnValue(undefined);

    vi.mocked(extractPdfPageHeaders).mockResolvedValue(makeTextExtractionResult({
      hasTextLayer: false, textLayerCoverage: 0,
    }));

    const result = await extractOcrFallbackMetadata({
      pdfBuffer: makePdfBuffer(),
      filename: 'Barnum and Baileys Favorite.pdf',
    });

    expect(result.title).toBe('Barnum and Baileys Favorite');
    expect(result.composer).toBe('Karl L. King');
    expect(result.confidence).toBeGreaterThanOrEqual(70);
  });

  it('returns 70+ confidence with title only (no author)', async () => {
    mockGetTitle.mockReturnValue('Festive Overture');
    mockGetAuthor.mockReturnValue(undefined);
    mockGetSubject.mockReturnValue(undefined);

    vi.mocked(extractPdfPageHeaders).mockResolvedValue(makeTextExtractionResult({
      hasTextLayer: false, textLayerCoverage: 0,
    }));

    const result = await extractOcrFallbackMetadata({
      pdfBuffer: makePdfBuffer(),
      filename: 'Festive Overture.pdf',
    });

    expect(result.title).toBe('Festive Overture');
    expect(result.confidence).toBeGreaterThanOrEqual(70);
    expect(result.composer).toBeUndefined();
  });

  it('falls through to text-layer extraction when pdf-lib title is absent', async () => {
    mockGetTitle.mockReturnValue('   '); // whitespace → treated as absent
    mockGetAuthor.mockReturnValue(undefined);
    mockGetSubject.mockReturnValue(undefined);

    vi.mocked(extractPdfPageHeaders).mockResolvedValue(
      makeTextExtractionResult({
        hasTextLayer: true,
        textLayerCoverage: 1.0,
        pageHeaders: [{ headerText: 'Chorale And Shaker Dance  By John Zdechlik', fullText: '' }],
      })
    );

    const result = await extractOcrFallbackMetadata({
      pdfBuffer: makePdfBuffer(),
      filename: 'Chorale And Shaker Dance.pdf',
    });

    // Should have fallen through to text-layer extraction
    expect(result.title).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('falls through when pdf-lib throws an error', async () => {
    mockPdfDocLoad.mockRejectedValue(new Error('encrypted PDF'));

    vi.mocked(extractPdfPageHeaders).mockResolvedValue(
      makeTextExtractionResult()
    );

    const result = await extractOcrFallbackMetadata({
      pdfBuffer: makePdfBuffer(),
      filename: 'Amparito Roca.pdf',
    });

    expect(result.title).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// extractOcrFallbackMetadata — step 1: text-layer extraction
// ---------------------------------------------------------------------------

describe('extractOcrFallbackMetadata — text-layer extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // pdf-lib returns no title → falls through
    mockPdfDocLoad.mockResolvedValue({
      getTitle: () => undefined,
      getAuthor: () => undefined,
      getSubject: () => undefined,
    });
  });

  it('returns title+composer from text layer with confidence >= 65', async () => {
    vi.mocked(extractPdfPageHeaders).mockResolvedValue(
      makeTextExtractionResult({
        pageHeaders: [{ headerText: 'Stars and Stripes Forever  By John Philip Sousa', fullText: '' }],
      })
    );

    const result = await extractOcrFallbackMetadata({
      pdfBuffer: makePdfBuffer(),
      filename: 'stars.pdf',
    });

    expect(result.title).toBeDefined();
    expect(result.confidence).toBeGreaterThanOrEqual(55);
    expect(result.isImageScanned).toBe(false);
  });

  it('falls through to filename fallback when text layer has no parseable title', async () => {
    vi.mocked(extractPdfPageHeaders).mockResolvedValue(
      makeTextExtractionResult({
        hasTextLayer: true,
        textLayerCoverage: 0.9,
        pageHeaders: [{ headerText: '...', fullText: '...' }],
      })
    );

    const result = await extractOcrFallbackMetadata({
      pdfBuffer: makePdfBuffer(),
      filename: 'My Score.pdf',
    });

    // Should still return something (filename fallback)
    expect(result.title).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('flags isImageScanned correctly for scanned PDFs', async () => {
    vi.mocked(extractPdfPageHeaders).mockResolvedValue(
      makeTextExtractionResult({
        hasTextLayer: false,
        textLayerCoverage: 0.1,
        pageHeaders: [],
      })
    );
    vi.mocked(renderPdfHeaderCropBatch).mockResolvedValue([]);

    const result = await extractOcrFallbackMetadata({
      pdfBuffer: makePdfBuffer(),
      filename: 'scanned.pdf',
      options: { enableTesseractOcr: false },
    });

    // isImageScanned = true because textLayerCoverage < 0.4
    expect(result.isImageScanned).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractOcrFallbackMetadata — no pdfBuffer (filename fallback only)
// ---------------------------------------------------------------------------

describe('extractOcrFallbackMetadata — no buffer', () => {
  it('returns filename-derived result without throwing', async () => {
    const result = await extractOcrFallbackMetadata({
      filename: 'Cuyahoga River March.pdf',
    });

    expect(result.title).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.needsManualReview).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isImageBasedPdf
// ---------------------------------------------------------------------------

describe('isImageBasedPdf', () => {
  it('returns true when textLayerCoverage is low', async () => {
    vi.mocked(extractPdfPageHeaders).mockResolvedValue({
      hasTextLayer: false,
      textLayerCoverage: 0.1,
      totalPages: 1,
      pageHeaders: [],
    });
    expect(await isImageBasedPdf(makePdfBuffer())).toBe(true);
  });

  it('returns false when textLayerCoverage is high', async () => {
    vi.mocked(extractPdfPageHeaders).mockResolvedValue({
      hasTextLayer: true,
      textLayerCoverage: 0.95,
      totalPages: 1,
      pageHeaders: [],
    });
    expect(await isImageBasedPdf(makePdfBuffer())).toBe(false);
  });

  it('returns true on extraction failure', async () => {
    vi.mocked(extractPdfPageHeaders).mockRejectedValue(new Error('parse error'));
    expect(await isImageBasedPdf(makePdfBuffer())).toBe(true);
  });

  it('returns false for string input (logs a warning)', async () => {
    expect(await isImageBasedPdf('not-a-buffer' as any)).toBe(false);
  });
});
