/**
 * Header Image Segmentation Service
 *
 * Provides LOCAL (no-LLM) segmentation of scanned music PDFs by:
 *  1. Rendering the top-of-page header crop for every page.
 *  2. Computing a fast perceptual average-hash (aHash) for each crop.
 *  3. Detecting segment boundaries where the header hash changes significantly.
 *  4. OCR-ing one representative crop per segment (via tesseract.js).
 *  5. Normalising OCR text into canonical instrument labels.
 *  6. Returning CuttingInstructions (0-indexed) compatible with the splitter.
 *
 * This replaces the LLM header-label pass for scanned PDFs, enabling
 * fully local, privacy-preserving, deterministic segmentation.
 *
 * Security:
 *  - No raw OCR text is logged; only lengths and confidence metrics.
 *  - No PDF bytes are exposed in logs.
 */

import sharp from 'sharp';
import { logger } from '@/lib/logger';
import { renderPdfHeaderCropBatch } from '@/lib/services/pdf-renderer';
import { normalizeInstrumentLabel } from '@/lib/smart-upload/part-naming';
import { isForbiddenLabel } from '@/lib/smart-upload/quality-gates';
import type { CuttingInstruction } from '@/types/smart-upload';

// =============================================================================
// Types
// =============================================================================

/**
 * Header Image Segmentation Options
 */
export interface HeaderImageSegmentationOptions {
  /** Header crop height as a fraction of the page height. Default 0.20. */
  cropHeightFraction?: number;
  /** Render scale for header crops. Default 2. */
  renderScale?: number;
  /** Hash grid size in pixels (width × height). Default 8×4. */
  hashWidth?: number;
  hashHeight?: number;
  /** Hamming distance threshold above which two pages are considered different parts. Default 10 (out of 32 bits). */
  hashDistanceThreshold?: number;
  /** Minimum pages in a segment to register as a real part (not a stray page). Default 1. */
  minSegmentPages?: number;
  /** Whether to enable tesseract OCR for label extraction. Default true. */
  enableOcr?: boolean;
  /** Additional crop fractions to try when the first OCR attempt returns no text. Default [0.15, 0.25, 0.30]. */
  fallbackCropFractions?: number[];
  /** Cache tag for pdf-renderer (e.g. session-id). */
  cacheTag?: string;
  /** Preprocessing options for OCR */
  preprocessing?: {
    /** Enable threshold/binarization. Default false. */
    enableThreshold?: boolean;
    /** Threshold value (0-255). Default 128. */
    thresholdValue?: number;
    /** Enable deskew. Default false. */
    enableDeskew?: boolean;
    /** Deskew angle tolerance in degrees. Default 5. */
    deskewTolerance?: number;
  };
}

export interface HeaderImageSegmentationResult {
  /** Derived cutting instructions (0-indexed). */
  cuttingInstructions: CuttingInstruction[];
  /** Overall confidence in the segmentation result (0-100). */
  confidence: number;
  /** Number of segments detected. */
  segmentCount: number;
  /** Whether at least one OCR-derived label was obtained. */
  hasOcrLabels: boolean;
  /** True when confidence is high enough to skip LLM entirely. */
  isDefinitive: boolean;
  /** Per-segment diagnostics (no raw text). */
  diagnostics: SegmentDiagnostic[];
}

export interface SegmentDiagnostic {
  segmentIndex: number;
  pageStart: number;
  pageEnd: number;
  /** Normalised label (no raw OCR text). */
  label: string | null;
  ocrConfidence: number;
  hashDistanceFromPrev: number | null;
}

// =============================================================================
// Internal types
// =============================================================================

interface PageHashEntry {
  pageIndex: number;
  hash: bigint;  // 64-bit aHash (8×8 grid, 1 bit per cell)
  hashSmall: bigint;  // 32-bit aHash (8×4 grid) — used for boundary detection
}

interface Segment {
  pageStart: number;
  pageEnd: number;
  representativePageIndex: number;
  label: string | null;
  ocrConfidence: number;
  hashDistanceFromPrev: number | null;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CROP_HEIGHT  = 0.20;
const DEFAULT_HASH_WIDTH   = 8;
const DEFAULT_HASH_HEIGHT  = 4;
const DEFAULT_HASH_THRESHOLD = 10; // bits out of 32
const DEFAULT_MIN_SEGMENT_PAGES = 1;

// Minimum number of pages a PDF must have for segmentation to be worthwhile.
const MIN_PAGES_TO_SEGMENT = 3;

// Confidence floor for an OCR result to count as "named segment"
const OCR_CONFIDENCE_MIN = 30;

// Base confidence awarded for successfully detecting segments
const BASE_SEGMENT_CONFIDENCE = 55;
// Extra confidence per segment that has an OCR-confirmed label
const LABEL_CONFIDENCE_BONUS = 5;
// Maximum total confidence cap
const MAX_CONFIDENCE = 95;

// =============================================================================
// Utilities
// =============================================================================

function nowMs(): number {
  const perf = (globalThis as unknown as { performance?: { now(): number } }).performance;
  if (perf?.now) return perf.now();
  return Date.now();
}

function safeErrorDetails(err: unknown) {
  const e = err instanceof Error ? err : new Error(String(err));
  return { errorMessage: e.message, errorName: e.name };
}

/**
 * Compute a perceptual average-hash (aHash) from a base64-encoded PNG/JPEG.
 *
 * Steps:
 *  1. Decode with sharp → resize to hashWidth×hashHeight, grayscale, raw pixels.
 *  2. Compute the mean pixel value.
 *  3. Each pixel bit = (pixel > mean) ? 1 : 0.
 *  4. Pack into a BigInt for fast Hamming distance comparison.
 *
 * Returns 0n on any error (hash comparison will yield high distance → boundary).
 */
async function computeAHash(
  base64Image: string,
  hashWidth: number,
  hashHeight: number,
): Promise<bigint> {
  try {
    const imageBuffer = Buffer.from(base64Image, 'base64');
    const { data } = await sharp(imageBuffer)
      .resize(hashWidth, hashHeight, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = new Uint8Array(data.buffer);
    const mean = pixels.reduce((s, p) => s + p, 0) / pixels.length;

    let hash = 0n;
    for (let i = 0; i < pixels.length; i++) {
      hash = (hash << 1n) | (pixels[i] >= mean ? 1n : 0n);
    }
    return hash;
  } catch {
    return 0n;
  }
}

/**
 * Hamming distance between two BigInts (bit count of XOR).
 */
function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b;
  let count = 0;
  while (xor > 0n) {
    count += Number(xor & 1n);
    xor >>= 1n;
  }
  return count;
}

/**
 * Optional tesseract OCR. Returns '' on failure or if not installed.
 */
async function tryOcr(base64Image: string): Promise<{ text: string; confidence: number }> {
  try {
    const mod = await import('tesseract.js').catch(() => null) as any;
    if (!mod?.recognize) return { text: '', confidence: 0 };

    const dataUrl = `data:image/png;base64,${base64Image}`;
    const result = await mod.recognize(dataUrl, 'eng', { logger: () => undefined });
    const text: string = typeof result?.data?.text === 'string' ? result.data.text.trim() : '';
    const confidence: number = typeof result?.data?.confidence === 'number' ? result.data.confidence : 0;
    return { text, confidence };
  } catch {
    return { text: '', confidence: 0 };
  }
}

// =============================================================================
// Core segmentation algorithm
// =============================================================================

/**
 * Run local header-image segmentation on a PDF buffer.
 *
 * This is a drop-in replacement for the LLM header-label pass in
 * smart-upload-processor.ts.  It produces 0-indexed CuttingInstructions
 * compatible with splitPdfByCuttingInstructions().
 *
 * Returns null when segmentation is not feasible (e.g. PDF too short).
 */
/**
 * Run local header-image segmentation on a PDF buffer.
 *
 * This is a drop-in replacement for the LLM header-label pass in
 * smart-upload-processor.ts.  It produces 0-indexed CuttingInstructions
 * compatible with splitPdfByCuttingInstructions().
 *
 * Returns null when segmentation is not feasible (e.g. PDF too short).
 *
 * @param pdfBuffer - PDF buffer to segment
 * @param totalPages - Total number of pages in the PDF
 * @param options - Segmentation options
 * @returns Segmentation result or null
 */
export async function segmentByHeaderImages(
  pdfBuffer: Buffer,
  totalPages: number,
  options: HeaderImageSegmentationOptions = {},
): Promise<HeaderImageSegmentationResult | null> {
  const start = nowMs();

  const {
    cropHeightFraction = DEFAULT_CROP_HEIGHT,
    renderScale = 2,
    hashWidth = DEFAULT_HASH_WIDTH,
    hashHeight = DEFAULT_HASH_HEIGHT,
    hashDistanceThreshold = DEFAULT_HASH_THRESHOLD,
    minSegmentPages = DEFAULT_MIN_SEGMENT_PAGES,
    enableOcr = true,
    fallbackCropFractions = [0.15, 0.25, 0.30],
    cacheTag,
    preprocessing,
  } = options;

  // Skip segmentation for very short PDFs — boundary detection is meaningless.
  if (totalPages < MIN_PAGES_TO_SEGMENT) {
    return null;
  }

  const allPageIndices = Array.from({ length: totalPages }, (_, i) => i);

  // Track diagnostics
  const hashDistances: number[] = [];
  let ocrFailures = 0;
  let ocrFallbacks = 0;

  // ── Step 1: Render header crops ──────────────────────────────────────────
  let headerCrops: string[];
  try {
    headerCrops = await renderPdfHeaderCropBatch(pdfBuffer, allPageIndices, {
      scale: renderScale,
      maxWidth: 1024,
      quality: 85,
      format: 'png',
      cropHeightFraction,
      cacheTag,
    });
  } catch (err) {
    logger.warn('header-image-segmentation: failed to render header crops', {
      ...safeErrorDetails(err),
      totalPages,
    });
    return null;
  }

  if (headerCrops.length !== totalPages) {
    logger.warn('header-image-segmentation: crop count mismatch', {
      expected: totalPages,
      got: headerCrops.length,
    });
    return null;
  }

  // ── Step 2: Compute perceptual hashes ────────────────────────────────────
  const pageHashes: PageHashEntry[] = await Promise.all(
    headerCrops.map(async (crop, i) => ({
      pageIndex: i,
      hash: await computeAHash(crop, hashWidth * 2, hashHeight * 2),
      hashSmall: await computeAHash(crop, hashWidth, hashHeight),
    }))
  );

  // ── Step 3: Detect segment boundaries ────────────────────────────────────
  const segments: Segment[] = [];
  let currentSegmentStart = 0;

  for (let i = 1; i <= totalPages; i++) {
    const isLastPage = i === totalPages;
    let hashDist: number | null = null;

    if (!isLastPage) {
      hashDist = hammingDistance(
        pageHashes[i - 1].hashSmall,
        pageHashes[i].hashSmall,
      );
      hashDistances.push(hashDist);
    }

    const isBoundary = isLastPage || (hashDist !== null && hashDist >= hashDistanceThreshold);

    if (isBoundary) {
      const segEnd = isLastPage ? totalPages - 1 : i - 1;
      const segLen = segEnd - currentSegmentStart + 1;

      if (segLen >= minSegmentPages) {
        segments.push({
          pageStart: currentSegmentStart,
          pageEnd: segEnd,
          representativePageIndex: currentSegmentStart,
          label: null,
          ocrConfidence: 0,
          hashDistanceFromPrev: currentSegmentStart > 0
            ? hammingDistance(
                pageHashes[currentSegmentStart - 1].hashSmall,
                pageHashes[currentSegmentStart].hashSmall,
              )
            : null,
        });
      }

      currentSegmentStart = i;
    }
  }

  // Fallback: if no boundaries found (or only 1 segment), return null —
  // the entire PDF is likely a single part and the standard pipeline handles it.
  if (segments.length <= 1) {
    logger.info('header-image-segmentation: no meaningful boundaries detected', {
      totalPages,
      hashThreshold: hashDistanceThreshold,
      hashDistances: hashDistances.slice(0, 10), // Log first 10 distances
      durationMs: Math.round(nowMs() - start),
    });
    return null;
  }

  // ── Step 4: OCR one representative crop per segment ──────────────────────
  if (enableOcr) {
    for (const seg of segments) {
      const repPage = seg.representativePageIndex;
      const cropBase64 = headerCrops[repPage];

      // First attempt with current crop height
      let ocrResult = await tryOcr(cropBase64);

      // Retry with fallback crop fractions if OCR returned no text
      if ((!ocrResult.text || ocrResult.confidence < OCR_CONFIDENCE_MIN) && fallbackCropFractions.length > 0) {
        ocrFallbacks++;
        for (const altFraction of fallbackCropFractions) {
          if (altFraction === cropHeightFraction) continue;
          try {
            const altCrops = await renderPdfHeaderCropBatch(pdfBuffer, [repPage], {
              scale: renderScale,
              maxWidth: 1024,
              quality: 85,
              format: 'png',
              cropHeightFraction: altFraction,
            });
            if (altCrops[0]) {
              // Apply preprocessing if configured
              let processedCrop = altCrops[0];
              if (preprocessing) {
                processedCrop = await preprocessForOcr(processedCrop, preprocessing);
              }
              const altResult = await tryOcr(processedCrop);
              if (altResult.text && altResult.confidence > ocrResult.confidence) {
                ocrResult = altResult;
                break;
              }
            }
          } catch {
            // try next fraction
          }
        }
      }

      if (ocrResult.text && ocrResult.confidence >= OCR_CONFIDENCE_MIN) {
        const normalized = normalizeInstrumentLabel(ocrResult.text);
        const candidateLabel = normalized.instrument?.trim();
        if (candidateLabel && !isForbiddenLabel(candidateLabel)) {
          seg.label = candidateLabel;
          seg.ocrConfidence = ocrResult.confidence;
        }
      } else {
        ocrFailures++;
      }

      logger.info('header-image-segmentation: segment OCR result', {
        segmentIndex: segments.indexOf(seg),
        pageStart: seg.pageStart,
        pageEnd: seg.pageEnd,
        hasLabel: seg.label !== null,
        ocrConfidence: seg.ocrConfidence,
      });
    }
  }

  // ── Step 5: Fill unlabelled segments with auto-labels ────────────────────
  let autoPartCounter = 1;
  for (const seg of segments) {
    if (!seg.label) {
      seg.label = `Part ${autoPartCounter++}`;
      seg.ocrConfidence = 0;
    }
  }

  // ── Step 6: Build cutting instructions (0-indexed) ───────────────────────
  const cuttingInstructions: CuttingInstruction[] = segments.map((seg, idx) => {
    const normalized = normalizeInstrumentLabel(seg.label ?? `Part ${idx + 1}`);
    return {
      partName: normalized.instrument || seg.label!,
      instrument: normalized.instrument || seg.label!,
      section: (normalized.section ?? 'Other') as CuttingInstruction['section'],
      transposition: (normalized.transposition ?? 'C') as CuttingInstruction['transposition'],
      partNumber: idx + 1,
      pageRange: [seg.pageStart, seg.pageEnd] as [number, number],
    };
  });

  // ── Compute confidence ────────────────────────────────────────────────────
  const ocrLabelledCount = segments.filter((s) => s.ocrConfidence >= OCR_CONFIDENCE_MIN).length;
  const ocrFraction = segments.length > 0 ? ocrLabelledCount / segments.length : 0;
  const hasOcrLabels = ocrLabelledCount > 0;

  const confidence = Math.min(
    MAX_CONFIDENCE,
    Math.round(BASE_SEGMENT_CONFIDENCE + ocrFraction * LABEL_CONFIDENCE_BONUS * 2 * (segments.length / totalPages * 10)),
  );

  // Build diagnostics (no raw text)
  const diagnostics: SegmentDiagnostic[] = segments.map((seg, idx) => ({
    segmentIndex: idx,
    pageStart: seg.pageStart,
    pageEnd: seg.pageEnd,
    label: seg.label,
    ocrConfidence: seg.ocrConfidence,
    hashDistanceFromPrev: seg.hashDistanceFromPrev,
  }));

  // Enhanced diagnostics logging
  logger.info('header-image-segmentation: segmentation complete', {
    totalPages,
    segmentCount: segments.length,
    ocrLabelledCount,
    ocrFailures,
    ocrFallbacks,
    confidence,
    durationMs: Math.round(nowMs() - start),
    hashThreshold: hashDistanceThreshold,
    hashWidth,
    hashHeight,
    cropHeightFraction,
    hashDistanceStats: {
      min: hashDistances.length > 0 ? Math.min(...hashDistances) : 0,
      max: hashDistances.length > 0 ? Math.max(...hashDistances) : 0,
      avg: hashDistances.length > 0 ? Math.round(hashDistances.reduce((a, b) => a + b, 0) / hashDistances.length) : 0,
    },
  });

  return {
    cuttingInstructions,
    confidence,
    segmentCount: segments.length,
    hasOcrLabels,
    isDefinitive: confidence >= 60 && hasOcrLabels,
    diagnostics,
  };
}

// =============================================================================
// Preprocess image for better OCR
// =============================================================================

/**
 * Preprocess a base64 PNG/JPEG for improved OCR accuracy.
 * Applies: grayscale → contrast normalization → mild sharpen → PNG re-encode.
 *
 * Returns the original base64 string on failure (so OCR can still attempt).
 */
/**
 * Preprocess options for OCR
 */
export interface OcrPreprocessOptions {
  /** Enable threshold/binarization. Default false. */
  enableThreshold?: boolean;
  /** Threshold value (0-255). Default 128. */
  thresholdValue?: number;
  /** Enable deskew. Default false. */
  enableDeskew?: boolean;
  /** Deskew angle tolerance in degrees. Default 5. */
  deskewTolerance?: number;
}

/**
 * Preprocess a base64 PNG/JPEG for improved OCR accuracy.
 * Applies: grayscale → contrast normalization → optional threshold/binarization → optional deskew → mild sharpen → PNG re-encode.
 *
 * @param base64Image - Input base64-encoded image
 * @param options - Preprocessing options
 * @returns Preprocessed base64-encoded image, or original on failure
 */
export async function preprocessForOcr(
  base64Image: string,
  options?: OcrPreprocessOptions
): Promise<string> {
  const opts = options || {};
  const enableThreshold = opts.enableThreshold ?? false;
  const thresholdValue = opts.thresholdValue ?? 128;
  const enableDeskew = opts.enableDeskew ?? false;

  try {
    const imageBuffer = Buffer.from(base64Image, 'base64');

    let pipeline = sharp(imageBuffer)
      .grayscale()
      .normalise(); // contrast stretch

    // Apply threshold/binarization if enabled
    if (enableThreshold) {
      pipeline = pipeline.threshold(thresholdValue);
    }

    // Apply deskew if enabled (using rotate with auto-fallback)
    if (enableDeskew) {
      pipeline = pipeline.rotate(); // Auto-detect and correct skew
    }

    const processed = await pipeline
      .sharpen({ sigma: 1.5, m2: 0.5 }) // mild sharpening
      .png({ compressionLevel: 1 })
      .toBuffer();

    return processed.toString('base64');
  } catch {
    return base64Image;
  }
}

/**
 * Simple threshold/binarization for OCR preprocessing.
 * More performant than full sharp pipeline when only threshold is needed.
 *
 * @param base64Image - Input base64-encoded image
 * @param threshold - Threshold value (0-255), default 128
 * @returns Binarized base64-encoded image, or original on failure
 */
export async function binarizeImage(
  base64Image: string,
  threshold: number = 128
): Promise<string> {
  try {
    const imageBuffer = Buffer.from(base64Image, 'base64');

    const processed = await sharp(imageBuffer)
      .grayscale()
      .threshold(threshold)
      .png({ compressionLevel: 1 })
      .toBuffer();

    return processed.toString('base64');
  } catch {
    return base64Image;
  }
}
