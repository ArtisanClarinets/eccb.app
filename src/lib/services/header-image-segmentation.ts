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
  /** Boundary-detection hash sized by hashWidth × hashHeight (default 32 bits). */
  hashSmall: bigint;
}

interface Segment {
  pageStart: number;
  pageEnd: number;
  representativePageIndex: number;
  label: string | null;
  ocrConfidence: number;
  hashDistanceFromPrev: number | null;
}

interface OcrResult {
  text: string;
  confidence: number;
}

interface TesseractLike {
  recognize(
    image: string,
    lang?: string,
    options?: Record<string, unknown>,
  ): Promise<{ data?: { text?: string; confidence?: number } }>;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CROP_HEIGHT = 0.20;
const DEFAULT_RENDER_SCALE = 3;
const DEFAULT_HASH_WIDTH = 8;
const DEFAULT_HASH_HEIGHT = 4;
const DEFAULT_HASH_THRESHOLD = 10; // bits out of 32
const DEFAULT_MIN_SEGMENT_PAGES = 1;
const DEFAULT_FALLBACK_CROP_FRACTIONS = [0.15, 0.25, 0.30];
const DEFAULT_OCR_THRESHOLD = 128;
const OCR_RENDER_MAX_WIDTH = 1600;

// Minimal base64 prefix of the PLACEHOLDER_IMAGE used by pdf-renderer.
const PLACEHOLDER_PREFIX = 'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVU';

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

let tesseractModulePromise: Promise<TesseractLike | null> | null = null;

function nowMs(): number {
  const perf = (globalThis as unknown as { performance?: { now(): number } }).performance;
  if (perf?.now) return perf.now();
  return Date.now();
}

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function safeErrorDetails(err: unknown) {
  const error = asError(err);
  return { errorMessage: error.message, errorName: error.name };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  return Math.round(clampNumber(value, min, max, fallback));
}

function uniqueCropFractions(primary: number, fallbackCropFractions: number[]): number[] {
  const seen = new Set<number>();
  const fractions: number[] = [];

  for (const raw of [primary, ...fallbackCropFractions]) {
    const normalized = Number(clampNumber(raw, 0.05, 0.8, DEFAULT_CROP_HEIGHT).toFixed(4));
    if (!seen.has(normalized)) {
      seen.add(normalized);
      fractions.push(normalized);
    }
  }

  return fractions;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function computeDistanceStats(distances: number[]): { min: number; max: number; avg: number } {
  if (distances.length === 0) {
    return { min: 0, max: 0, avg: 0 };
  }

  let min = distances[0];
  let max = distances[0];
  let sum = 0;

  for (const value of distances) {
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
  }

  return {
    min,
    max,
    avg: Math.round(sum / distances.length),
  };
}

async function getTesseractModule(): Promise<TesseractLike | null> {
  if (!tesseractModulePromise) {
    tesseractModulePromise = import('tesseract.js')
      .then((mod) => {
        const maybeRecognizer = mod as unknown as TesseractLike;
        return typeof maybeRecognizer?.recognize === 'function' ? maybeRecognizer : null;
      })
      .catch(() => null);
  }

  return tesseractModulePromise;
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
 * Returns 0n on error to keep the pipeline deterministic.
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

    const pixels = Uint8Array.from(data);
    if (pixels.length === 0) return 0n;

    let sum = 0;
    for (const pixel of pixels) sum += pixel;
    const mean = sum / pixels.length;

    const firstPixel = pixels[0];
    const allSame = pixels.every((pixel) => pixel === firstPixel);

    let hash = 0n;
    for (let i = 0; i < pixels.length; i++) {
      const bit = allSame ? (pixels[i] > 127 ? 1n : 0n) : (pixels[i] > mean ? 1n : 0n);
      hash = (hash << 1n) | bit;
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
async function tryOcr(base64Image: string): Promise<OcrResult> {
  try {
    const mod = await getTesseractModule();
    if (!mod) return { text: '', confidence: 0 };

    const dataUrl = `data:image/png;base64,${base64Image}`;
    const result = await mod.recognize(dataUrl, 'eng', { logger: () => undefined });
    const text = typeof result?.data?.text === 'string' ? result.data.text.trim() : '';
    const confidence = typeof result?.data?.confidence === 'number' ? result.data.confidence : 0;

    return { text, confidence };
  } catch {
    return { text: '', confidence: 0 };
  }
}

async function preprocessMaybe(
  base64Image: string,
  options: OcrPreprocessOptions,
): Promise<string> {
  try {
    return await preprocessForOcr(base64Image, options);
  } catch {
    return base64Image;
  }
}

function buildAllPageIndices(totalPages: number): number[] {
  return Array.from({ length: totalPages }, (_, index) => index);
}

function mergeSmallSegments(segments: Segment[], minSegmentPages: number): Segment[] {
  if (minSegmentPages <= 1 || segments.length <= 1) {
    return segments;
  }

  let working = [...segments];
  let didMerge = true;

  while (didMerge && working.length > 1) {
    didMerge = false;
    const merged: Segment[] = [];

    for (let i = 0; i < working.length; i++) {
      const current = working[i];
      const pageCount = current.pageEnd - current.pageStart + 1;

      if (pageCount < minSegmentPages) {
        if (merged.length > 0) {
          merged[merged.length - 1] = {
            ...merged[merged.length - 1],
            pageEnd: current.pageEnd,
          };
        } else if (i + 1 < working.length) {
          working[i + 1] = {
            ...working[i + 1],
            pageStart: current.pageStart,
            representativePageIndex: current.pageStart,
            hashDistanceFromPrev: current.hashDistanceFromPrev,
          };
        } else {
          merged.push({ ...current });
        }

        didMerge = true;
      } else {
        merged.push({ ...current });
      }
    }

    working = merged;
  }

  return working;
}

async function detectRepresentativeLabel(
  pdfBuffer: Buffer,
  representativePageIndex: number,
  initialCropBase64: string,
  cropFractionsToTry: number[],
  renderScale: number,
  cacheTag: string | undefined,
  preprocessing: OcrPreprocessOptions,
): Promise<{ label: string | null; confidence: number; usedFallback: boolean; failed: boolean }> {
  let bestResult: OcrResult = { text: '', confidence: 0 };
  let usedFallback = false;

  for (let i = 0; i < cropFractionsToTry.length; i++) {
    const fraction = cropFractionsToTry[i];
    let cropBase64 = initialCropBase64;

    if (i > 0) {
      usedFallback = true;

      try {
        const altCrops = await renderPdfHeaderCropBatch(pdfBuffer, [representativePageIndex], {
          scale: Math.max(renderScale, DEFAULT_RENDER_SCALE),
          maxWidth: OCR_RENDER_MAX_WIDTH,
          quality: 90,
          format: 'png',
          cropHeightFraction: fraction,
          cacheTag,
        });

        cropBase64 = altCrops[0] || '';
      } catch {
        continue;
      }

      if (!cropBase64 || cropBase64.startsWith(PLACEHOLDER_PREFIX)) {
        continue;
      }
    }

    const prepared = await preprocessMaybe(cropBase64, preprocessing);
    const candidate = await tryOcr(prepared);

    if (candidate.text && candidate.confidence > bestResult.confidence) {
      bestResult = candidate;
    }

    if (candidate.text && candidate.confidence >= OCR_CONFIDENCE_MIN) {
      break;
    }
  }

  if (!bestResult.text || bestResult.confidence < OCR_CONFIDENCE_MIN) {
    return {
      label: null,
      confidence: 0,
      usedFallback,
      failed: true,
    };
  }

  const normalized = normalizeInstrumentLabel(bestResult.text);
  const candidateLabel = normalized.instrument?.trim();

  if (!candidateLabel || isForbiddenLabel(candidateLabel)) {
    return {
      label: null,
      confidence: 0,
      usedFallback,
      failed: true,
    };
  }

  return {
    label: candidateLabel,
    confidence: clampConfidence(bestResult.confidence),
    usedFallback,
    failed: false,
  };
}

// =============================================================================
// Core segmentation algorithm
// =============================================================================

/**
 * Run local header-image segmentation on a PDF buffer.
 *
 * This is a drop-in replacement for the LLM header-label pass in
 * smart-upload-processor.ts. It produces 0-indexed CuttingInstructions
 * compatible with splitPdfByCuttingInstructions().
 *
 * Returns null when segmentation is not feasible (e.g. PDF too short).
 */
export async function segmentByHeaderImages(
  pdfBuffer: Buffer,
  totalPages: number,
  options: HeaderImageSegmentationOptions = {},
): Promise<HeaderImageSegmentationResult | null> {
  const start = nowMs();

  const cropHeightFraction = clampNumber(
    options.cropHeightFraction,
    0.05,
    0.8,
    DEFAULT_CROP_HEIGHT,
  );
  const renderScale = clampNumber(options.renderScale, 1, 8, DEFAULT_RENDER_SCALE);
  const hashWidth = clampInteger(options.hashWidth, 2, 32, DEFAULT_HASH_WIDTH);
  const hashHeight = clampInteger(options.hashHeight, 2, 32, DEFAULT_HASH_HEIGHT);
  const hashDistanceThreshold = clampInteger(
    options.hashDistanceThreshold,
    0,
    hashWidth * hashHeight,
    DEFAULT_HASH_THRESHOLD,
  );
  const minSegmentPages = clampInteger(
    options.minSegmentPages,
    1,
    Math.max(1, totalPages),
    DEFAULT_MIN_SEGMENT_PAGES,
  );
  const enableOcr = options.enableOcr !== false;
  const fallbackCropFractions = Array.isArray(options.fallbackCropFractions)
    ? options.fallbackCropFractions
    : DEFAULT_FALLBACK_CROP_FRACTIONS;
  const cacheTag = options.cacheTag;

  const cropFractionsToTry = uniqueCropFractions(cropHeightFraction, fallbackCropFractions);

  const effectivePreprocessing: OcrPreprocessOptions = {
    enableThreshold: options.preprocessing?.enableThreshold ?? true,
    thresholdValue: clampInteger(
      options.preprocessing?.thresholdValue,
      0,
      255,
      DEFAULT_OCR_THRESHOLD,
    ),
    enableDeskew: options.preprocessing?.enableDeskew ?? false,
    deskewTolerance: clampNumber(
      options.preprocessing?.deskewTolerance,
      0,
      45,
      5,
    ),
  };

  if (totalPages < MIN_PAGES_TO_SEGMENT) {
    return null;
  }

  const allPageIndices = buildAllPageIndices(totalPages);
  const hashDistances: number[] = [];
  let ocrFailures = 0;
  let ocrFallbacks = 0;

  // ── Step 1: Render header crops ──────────────────────────────────────────
  let headerCrops: string[];
  try {
    headerCrops = await renderPdfHeaderCropBatch(pdfBuffer, allPageIndices, {
      scale: renderScale,
      maxWidth: OCR_RENDER_MAX_WIDTH,
      quality: 90,
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

  const placeholderCount = headerCrops.filter((crop) => crop.startsWith(PLACEHOLDER_PREFIX)).length;
  if (placeholderCount > 0) {
    logger.warn('header-image-segmentation: placeholder renders detected — skipping segmentation', {
      totalPages,
      placeholderCount,
    });
    return null;
  }

  // ── Step 2: Compute perceptual hashes ────────────────────────────────────
  const pageHashes: PageHashEntry[] = await Promise.all(
    headerCrops.map(async (crop, pageIndex) => ({
      pageIndex,
      hashSmall: await computeAHash(crop, hashWidth, hashHeight),
    })),
  );

  // ── Step 3: Detect segment boundaries ────────────────────────────────────
  const boundaryStarts: number[] = [0];

  for (let i = 1; i < totalPages; i++) {
    const hashDist = hammingDistance(
      pageHashes[i - 1].hashSmall,
      pageHashes[i].hashSmall,
    );
    const cropChanged = headerCrops[i - 1] !== headerCrops[i];

    hashDistances.push(hashDist);

    if (
      hashDist >= hashDistanceThreshold ||
      (hashDist === 0 && cropChanged && hashDistanceThreshold > 0)
    ) {
      boundaryStarts.push(i);
    }
  }

  let rawSegments: Segment[] = boundaryStarts.map((pageStart, idx) => {
    const pageEnd = idx + 1 < boundaryStarts.length
      ? boundaryStarts[idx + 1] - 1
      : totalPages - 1;

    return {
      pageStart,
      pageEnd,
      representativePageIndex: pageStart,
      label: null,
      ocrConfidence: 0,
      hashDistanceFromPrev: pageStart > 0
        ? hammingDistance(
            pageHashes[pageStart - 1].hashSmall,
            pageHashes[pageStart].hashSmall,
          )
        : null,
    };
  });

  rawSegments = mergeSmallSegments(rawSegments, minSegmentPages);
  const segments = rawSegments;

  if (segments.length <= 1) {
    logger.info('header-image-segmentation: no meaningful boundaries detected', {
      totalPages,
      hashThreshold: hashDistanceThreshold,
      hashDistances: hashDistances.slice(0, 10),
      durationMs: Math.round(nowMs() - start),
    });
    return null;
  }

  // ── Step 4: OCR one representative crop per segment ──────────────────────
  if (enableOcr) {
    for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
      const seg = segments[segmentIndex];
      const repPage = seg.representativePageIndex;
      const cropBase64 = headerCrops[repPage];

      const labelResult = await detectRepresentativeLabel(
        pdfBuffer,
        repPage,
        cropBase64,
        cropFractionsToTry,
        renderScale,
        cacheTag,
        effectivePreprocessing,
      );

      if (labelResult.usedFallback) {
        ocrFallbacks++;
      }

      if (labelResult.label) {
        seg.label = labelResult.label;
        seg.ocrConfidence = labelResult.confidence;
      } else {
        ocrFailures++;
      }

      logger.info('header-image-segmentation: segment OCR result', {
        segmentIndex,
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
    const instrument = normalized.instrument || seg.label || `Part ${idx + 1}`;

    return {
      partName: instrument,
      instrument,
      section: (normalized.section ?? 'Other') as CuttingInstruction['section'],
      transposition: (normalized.transposition ?? 'C') as CuttingInstruction['transposition'],
      partNumber: idx + 1,
      pageRange: [seg.pageStart, seg.pageEnd] as [number, number],
    };
  });

  // ── Compute confidence ────────────────────────────────────────────────────
  const ocrLabelledCount = segments.filter((seg) => seg.ocrConfidence >= OCR_CONFIDENCE_MIN).length;
  const ocrFraction = segments.length > 0 ? ocrLabelledCount / segments.length : 0;
  const hasOcrLabels = ocrLabelledCount > 0;

  const confidence = Math.min(
    MAX_CONFIDENCE,
    Math.round(
      BASE_SEGMENT_CONFIDENCE +
      ocrFraction * LABEL_CONFIDENCE_BONUS * 2 * ((segments.length / totalPages) * 10),
    ),
  );

  const diagnostics: SegmentDiagnostic[] = segments.map((seg, idx) => ({
    segmentIndex: idx,
    pageStart: seg.pageStart,
    pageEnd: seg.pageEnd,
    label: seg.label,
    ocrConfidence: seg.ocrConfidence,
    hashDistanceFromPrev: seg.hashDistanceFromPrev,
  }));

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
    hashDistanceStats: computeDistanceStats(hashDistances),
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
 * Applies: grayscale → contrast normalization → optional threshold/binarization
 * → optional deskew → mild sharpen → PNG re-encode.
 *
 * @param base64Image - Input base64-encoded image
 * @param options - Preprocessing options
 * @returns Preprocessed base64-encoded image, or original on failure
 */
export async function preprocessForOcr(
  base64Image: string,
  options?: OcrPreprocessOptions,
): Promise<string> {
  const opts = options || {};
  const enableThreshold = opts.enableThreshold ?? false;
  const thresholdValue = clampInteger(opts.thresholdValue, 0, 255, DEFAULT_OCR_THRESHOLD);
  const enableDeskew = opts.enableDeskew ?? false;

  try {
    const imageBuffer = Buffer.from(base64Image, 'base64');

    let pipeline = sharp(imageBuffer)
      .grayscale()
      .normalise();

    if (enableThreshold) {
      pipeline = pipeline.threshold(thresholdValue);
    }

    // Sharp auto-rotate/detect behavior is the only available server-side deskew-like
    // fallback here. deskewTolerance is retained in the API for compatibility.
    if (enableDeskew) {
      pipeline = pipeline.rotate();
    }

    const processed = await pipeline
      .sharpen({ sigma: 1.5, m2: 0.5 })
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
  threshold: number = DEFAULT_OCR_THRESHOLD,
): Promise<string> {
  const safeThreshold = clampInteger(threshold, 0, 255, DEFAULT_OCR_THRESHOLD);

  try {
    const imageBuffer = Buffer.from(base64Image, 'base64');

    const processed = await sharp(imageBuffer)
      .grayscale()
      .threshold(safeThreshold)
      .png({ compressionLevel: 1 })
      .toBuffer();

    return processed.toString('base64');
  } catch {
    return base64Image;
  }
}