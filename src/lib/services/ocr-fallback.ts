/**
 * OCR Fallback Service
 *
 * Enterprise-grade fallback metadata extraction when:
 * - PDF is scanned/image-based (no text layer), OR
 * - LLM providers are unavailable/unreachable, OR
 * - Smart Upload wants a deterministic non-LLM path.
 *
 * Backward-compatibility:
 * - Existing exports and behavior remain intact:
 *   - isImageBasedPdf
 *   - generateOCRFallback
 *   - parseFilenameMetadata
 *
 * New capability:
 * - extractOcrFallbackMetadata(): best-effort extraction:
 *   1) PDF text layer (fast, cheap, deterministic)
 *   2) Optional OCR (tesseract.js) on rendered header/full-page images
 *   3) Filename parsing fallback
 *
 * Security:
 * - Never log PDF bytes
 * - Never log extracted text (PDF text or OCR output)
 * - Logs only metrics (lengths, durations, strategy)
 */

import path from 'path';
import { logger } from '@/lib/logger';
import { extractPdfPageHeaders } from '@/lib/services/pdf-text-extractor';
import { renderPdfToImage, renderPdfHeaderCropBatch } from '@/lib/services/pdf-renderer';

export interface OCRMetadata {
  title: string;
  composer?: string;
  confidence: number;
  isImageScanned: boolean;
  needsManualReview: boolean;
}

export interface OcrFallbackOptions {
  /**
   * Max pages to probe for text-layer extraction.
   * Default: 3 (fast and sufficient for cover pages).
   */
  maxTextProbePages?: number;

  /**
   * Whether to attempt OCR using tesseract.js (optional dependency).
   * Default: true
   */
  enableTesseractOcr?: boolean;

  /**
   * OCR strategy:
   * - 'header': only OCR the top-of-page crop (fastest; best for part labels)
   * - 'full': OCR the full first page (slower; better for title/composer)
   * - 'both': try header first, then full if needed
   * Default: 'both'
   */
  ocrMode?: 'header' | 'full' | 'both';

  /**
   * Render quality for OCR images.
   * Keep defaults aligned with pdf-renderer defaults.
   */
  renderScale?: number; // default 2
  renderMaxWidth?: number; // default 1024
  renderFormat?: 'png' | 'jpeg'; // default 'png'
  renderQuality?: number; // default 85

  /**
   * If we reach >= this confidence, we can mark needsManualReview false.
   * Default: 70
   */
  autoAcceptConfidenceThreshold?: number;
}

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * Error details helper used for safe structured logging.
 * (Fixes the build error: safeErrorDetails must exist and be referenced consistently.)
 */
function safeErrorDetails(err: unknown) {
  const e = asError(err);
  return { errorMessage: e.message, errorName: e.name, errorStack: e.stack };
}

function nowMs(): number {
  const perf = (globalThis as any)?.performance;
  if (perf?.now) return perf.now();
  return Date.now();
}

function safeBaseName(filename: string): string {
  try {
    return path.basename(filename);
  } catch {
    return filename;
  }
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function stripPdfExtension(input: string): string {
  return input.replace(/\.pdf$/i, '').trim();
}

/**
 * Heuristic extraction of title/composer from a blob of text.
 * We keep this conservative and deterministic.
 *
 * IMPORTANT: This does not log or return the raw text; only derived fields.
 */
function extractTitleComposerFromText(text: string): { title?: string; composer?: string } {
  const cleaned = normalizeWhitespace(
    text
      .replace(/[_]+/g, ' ')
      .replace(/[|]+/g, ' ')
      .replace(/[•·]+/g, ' ')
  );

  if (!cleaned || cleaned.length < 3) return {};

  // Common markers
  // Examples:
  //   "AMERICAN PATROL" "Karl L. King"
  //   "Title" "By Composer"
  const byMatch = cleaned.match(
    /\b(?:by|composer|composed\s+by|arr\.?\s*by)\b\s*([A-Z][A-Za-z.'’-]{1,}.*)$/i
  );
  const arrangerMatch = cleaned.match(
    /\b(?:arranged\s+by|arr\.?\s*by)\b\s*([A-Z][A-Za-z.'’-]{1,}.*)$/i
  );

  // Candidate lines: we don't have real lines here, so approximate by splitting on long gaps.
  const tokens = cleaned
    .split(/\s{2,}|\s-\s|\s•\s|\s\|\s/)
    .map((t) => normalizeWhitespace(t))
    .filter(Boolean);

  // Title candidate: prefer something reasonably long and not "by/arranged" line.
  let titleCandidate: string | undefined;
  for (const t of tokens.slice(0, 6)) {
    const lowered = t.toLowerCase();
    if (
      lowered.startsWith('by ') ||
      lowered.startsWith('arr') ||
      lowered.includes('arranged by') ||
      lowered.includes('composer')
    ) {
      continue;
    }
    // Avoid tiny fragments
    if (t.length >= 4 && t.length <= 120) {
      titleCandidate = t;
      break;
    }
  }

  // Composer candidate: from explicit marker first, otherwise second reasonable token
  let composerCandidate: string | undefined;
  if (byMatch?.[1]) composerCandidate = normalizeWhitespace(byMatch[1]);
  if (!composerCandidate && arrangerMatch?.[1]) composerCandidate = normalizeWhitespace(arrangerMatch[1]);

  if (!composerCandidate) {
    for (const t of tokens.slice(0, 8)) {
      const lowered = t.toLowerCase();
      if (lowered.includes('by ') || lowered.includes('arr') || lowered.includes('composer')) continue;

      // Heuristic: looks name-like
      if (/^[A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){0,3}$/.test(t) && t.length <= 40) {
        // Don’t choose titleCandidate again
        if (titleCandidate && normalizeWhitespace(t) === normalizeWhitespace(titleCandidate)) continue;
        composerCandidate = t;
        break;
      }
    }
  }

  // Final cleanup
  const title = titleCandidate ? normalizeWhitespace(titleCandidate) : undefined;
  const composer = composerCandidate ? normalizeWhitespace(composerCandidate) : undefined;

  return { title, composer };
}

/**
 * Optional OCR engine using tesseract.js.
 * - Dynamic import so build/run works even if dependency is absent.
 * - Returns '' if OCR cannot run.
 */
async function tryOcrBase64ImageToText(base64PngOrJpeg: string): Promise<string> {
  const start = nowMs();

  try {
    // Optional dependency – only works if installed.
    const mod: any = await import('tesseract.js').catch(() => null);
    if (!mod?.recognize) {
      logger.warn('OCR engine unavailable (tesseract.js not installed); skipping OCR');
      return '';
    }

    // tesseract.js expects a data URL or buffer; we supply data URL.
    // NOTE: we default to image/png; OCR will still run even if the content was jpeg base64.
    const dataUrl = `data:image/png;base64,${base64PngOrJpeg}`;

    const result: any = await mod.recognize(dataUrl, 'eng', {
      // Keep logs quiet; do not emit OCR text or internal debug.
      logger: () => undefined,
    });

    const text = typeof result?.data?.text === 'string' ? result.data.text : '';
    logger.info('OCR completed', {
      durationMs: Math.round(nowMs() - start),
      extractedChars: text ? text.length : 0,
    });

    return text;
  } catch (err) {
    const details = safeErrorDetails(err);
    logger.warn('OCR failed; skipping OCR path', {
      ...details,
      durationMs: Math.round(nowMs() - start),
    });
    return '';
  }
}

/**
 * Enterprise-grade OCR fallback metadata extraction.
 * This is the function you should call when LLMs are not available.
 *
 * It never throws; it always returns a usable OCRMetadata payload.
 */
export async function extractOcrFallbackMetadata(params: {
  pdfBuffer?: Buffer;
  filename: string;
  options?: OcrFallbackOptions;
}): Promise<OCRMetadata> {
  const start = nowMs();

  const { pdfBuffer, filename, options = {} } = params;

  const fileSafe = safeBaseName(filename);

  const {
    maxTextProbePages = 3,
    enableTesseractOcr = true,
    ocrMode = 'both',
    renderScale = 2,
    renderMaxWidth = 1024,
    renderFormat = 'png',
    renderQuality = 85,
    autoAcceptConfidenceThreshold = 70,
  } = options;

  // 0) Always compute filename fallback (guaranteed output)
  const filenameFallback = generateOCRFallback(fileSafe);

  if (!pdfBuffer) {
    logger.warn('OCR fallback: no pdfBuffer provided; using filename fallback only', {
      filename: fileSafe,
      durationMs: Math.round(nowMs() - start),
    });
    return filenameFallback;
  }

  // 1) Attempt text-layer extraction first (fast and deterministic)
  try {
    const extraction = await extractPdfPageHeaders(pdfBuffer, maxTextProbePages);
    const isImageScanned = !extraction.hasTextLayer || extraction.textLayerCoverage < 0.4;

    // Use first page(s) text to guess title/composer
    const combinedText = extraction.pageHeaders
      .slice(0, Math.min(extraction.pageHeaders.length, maxTextProbePages))
      .map((p) => (p.headerText || '') + ' ' + (p.fullText || ''))
      .join(' ')
      .slice(0, 3000);

    const tc = extractTitleComposerFromText(combinedText);

    if (tc.title) {
      const confidence = tc.composer ? 65 : 55;
      const result: OCRMetadata = {
        title: tc.title,
        composer: tc.composer,
        confidence,
        isImageScanned,
        needsManualReview: confidence < autoAcceptConfidenceThreshold,
      };

      logger.info('OCR fallback: extracted metadata from PDF text layer', {
        filename: fileSafe,
        hasTextLayer: extraction.hasTextLayer,
        textLayerCoverage: extraction.textLayerCoverage,
        isImageScanned,
        confidence: result.confidence,
        durationMs: Math.round(nowMs() - start),
      });

      return result;
    }

    // If we have a strong text layer but couldn't parse title, still return filename fallback,
    // but mark scanning state correctly.
    if (!isImageScanned) {
      logger.info(
        'OCR fallback: PDF has text layer but title parse was inconclusive; using filename fallback',
        {
          filename: fileSafe,
          hasTextLayer: extraction.hasTextLayer,
          textLayerCoverage: extraction.textLayerCoverage,
          durationMs: Math.round(nowMs() - start),
        }
      );

      return {
        ...filenameFallback,
        isImageScanned,
      };
    }

    // If scanned, continue to OCR attempt below.
    logger.info('OCR fallback: PDF appears scanned; proceeding to OCR attempt', {
      filename: fileSafe,
      hasTextLayer: extraction.hasTextLayer,
      textLayerCoverage: extraction.textLayerCoverage,
      durationMs: Math.round(nowMs() - start),
    });
  } catch (err) {
    const details = safeErrorDetails(err);
    logger.warn('OCR fallback: text-layer probe failed; proceeding to OCR attempt', {
      filename: fileSafe,
      ...details,
    });
  }

  // 2) Attempt real OCR on rendered image(s), if enabled
  if (enableTesseractOcr) {
    try {
      let ocrText = '';

      if (ocrMode === 'header' || ocrMode === 'both') {
        const crops = await renderPdfHeaderCropBatch(pdfBuffer, [0], {
          scale: renderScale,
          maxWidth: renderMaxWidth,
          quality: renderQuality,
          format: renderFormat,
          cropHeightFraction: 0.25,
        });

        if (crops?.[0]) {
          ocrText = await tryOcrBase64ImageToText(crops[0]);
        }
      }

      if (
        (!ocrText || ocrText.trim().length < 8) &&
        (ocrMode === 'full' || ocrMode === 'both')
      ) {
        const page0 = await renderPdfToImage(pdfBuffer, {
          pageIndex: 0,
          scale: renderScale,
          maxWidth: renderMaxWidth,
          quality: renderQuality,
          format: renderFormat,
        });

        if (page0) {
          const fullText = await tryOcrBase64ImageToText(page0);
          // Prefer longer of header vs full
          if (fullText && fullText.length > ocrText.length) ocrText = fullText;
        }
      }

      const tc = extractTitleComposerFromText(ocrText);

      if (tc.title) {
        // OCR is inherently noisy; keep confidence conservative.
        const confidence = tc.composer ? 55 : 45;
        const result: OCRMetadata = {
          title: tc.title,
          composer: tc.composer,
          confidence,
          isImageScanned: true,
          needsManualReview: confidence < autoAcceptConfidenceThreshold,
        };

        logger.info('OCR fallback: extracted metadata via OCR', {
          filename: fileSafe,
          confidence: result.confidence,
          durationMs: Math.round(nowMs() - start),
          ocrMode,
        });

        return result;
      }

      logger.info('OCR fallback: OCR completed but metadata parse inconclusive; using filename fallback', {
        filename: fileSafe,
        durationMs: Math.round(nowMs() - start),
        ocrMode,
      });
    } catch (err) {
      const details = safeErrorDetails(err);
      logger.warn('OCR fallback: OCR path failed; using filename fallback', {
        filename: fileSafe,
        ...details,
      });
    }
  } else {
    logger.info('OCR fallback: OCR disabled; using filename fallback', {
      filename: fileSafe,
      durationMs: Math.round(nowMs() - start),
    });
  }

  // 3) Filename fallback (guaranteed)
  logger.info('OCR fallback: returning filename-derived metadata', {
    filename: fileSafe,
    confidence: filenameFallback.confidence,
    durationMs: Math.round(nowMs() - start),
  });

  return filenameFallback;
}

/**
 * Check if PDF appears to be scanned/image-based (not searchable text)
 *
 * Uses text-layer coverage from pdfjs extraction.
 *
 * LOGIC UNCHANGED:
 *   isImageBased = !hasTextLayer || textLayerCoverage < 0.4
 */
export async function isImageBasedPdf(pdfBuffer: Buffer | string): Promise<boolean> {
  if (typeof pdfBuffer === 'string') {
    logger.warn('isImageBasedPdf called with string input; expected Buffer', {
      inputType: 'string',
    });
    return false;
  }

  try {
    const extraction = await extractPdfPageHeaders(pdfBuffer);
    const isImageBased = !extraction.hasTextLayer || extraction.textLayerCoverage < 0.4;

    logger.info('isImageBasedPdf evaluated', {
      hasTextLayer: extraction.hasTextLayer,
      textLayerCoverage: extraction.textLayerCoverage,
      isImageBased,
    });

    return isImageBased;
  } catch (error) {
    const details = safeErrorDetails(error);
    logger.warn('isImageBasedPdf failed to inspect PDF text layer; assuming image-based', {
      ...details,
    });
    return true;
  }
}

/**
 * Generate fallback metadata when standard extraction fails.
 * Uses filename parsing and provides a low confidence score to indicate
 * that manual review is required.
 *
 * LOGIC UNCHANGED (kept compatible).
 */
export function generateOCRFallback(filename: string): OCRMetadata {
  // Remove .pdf extension and clean up filename
  let title = stripPdfExtension(filename);

  // Try to extract common patterns from filenames
  // Pattern: "Composer - Title" or "Title - Composer"
  const dashMatch = title.match(/^(.+?)\s*-\s*(.+)$/);
  let composer: string | undefined;

  if (dashMatch) {
    // Assume first part is composer if it looks like a name (capitalized, not too long, not just a number)
    const firstPart = dashMatch[1].trim();
    const secondPart = dashMatch[2].trim();

    // Check if first part is just a number (like "01" or "1") - skip it entirely
    if (/^\d+$/.test(firstPart)) {
      // First part is just a track/sequence number, use second part as title
      title = secondPart;
      // Don't try to extract composer from the remaining title
    } else if (!/^\d/.test(firstPart) && firstPart.length < 30 && /^[A-Z]/.test(firstPart)) {
      composer = firstPart;
      title = secondPart;
    } else if (!/^\d/.test(secondPart) && secondPart.length < 30 && /^[A-Z]/.test(secondPart)) {
      composer = secondPart;
      title = firstPart;
    }
  }

  // Clean up common artifacts from filenames
  title = title
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\d+[\s._-]+/, '') // Remove leading numbers like "01-", "1. "
    .trim();

  const result: OCRMetadata = {
    title,
    confidence: 25, // Very low - needs manual review
    isImageScanned: true,
    needsManualReview: true,
  };

  if (composer) {
    result.composer = composer;
    result.confidence = 35; // Slightly higher if we extracted composer from filename
  }

  logger.info('Generated OCR fallback metadata', {
    filename, // not sensitive
    title: result.title,
    composer: result.composer,
    confidence: result.confidence,
  });

  return result;
}

/**
 * Parse score metadata from common filename patterns.
 * Returns structured metadata if recognized patterns are found.
 *
 * LOGIC UNCHANGED.
 */
export function parseFilenameMetadata(filename: string): Partial<OCRMetadata> {
  const cleanName = stripPdfExtension(filename);
  const result: Partial<OCRMetadata> = {};

  // Pattern: "Part 1 - Flute" or "Flute Part 1"
  const partMatch = cleanName.match(/(?:Part\s*(\d+)|(\d+)(?:st|nd|rd|th)\s*Part)/i);
  if (partMatch) {
    // This appears to be a part - extract instrument if present
    const instrumentMatch = cleanName.match(
      /(?:Flute|Oboe|Clarinet|Saxophone|Trumpet|Trombone|Horn|Tuba|Percussion|Violin|Viola|Cello|Bass)/i
    );
    if (instrumentMatch) {
      result.title = cleanName;
      result.confidence = 30;
    }
  }

  // Pattern: "Conductor Score" or "Full Score"
  if (/conductor|full\s*score|score/i.test(cleanName)) {
    result.title = cleanName;
    result.confidence = 35;
  }

  return result;
}