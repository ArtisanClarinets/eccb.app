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
import os from 'os';
import { spawn } from 'child_process';
import { logger } from '@/lib/logger';
import { extractPdfPageHeaders } from '@/lib/services/pdf-text-extractor';
import { renderPdfToImage, renderPdfHeaderCropBatch } from '@/lib/services/pdf-renderer';
import { preprocessForOcr } from '@/lib/services/header-image-segmentation';

/**
 * OCR metadata result
 */
export interface OCRMetadata {
  title: string;
  composer?: string;
  arranger?: string;
  publisher?: string;
  confidence: number;
  isImageScanned: boolean;
  needsManualReview: boolean;
  /** Raw OCR text if requested (never logged) */
  rawOcrText?: string;
  /** Number of characters extracted from text layer */
  textLayerChars?: number;
  /** Number of pages processed by OCR */
  ocrPagesProcessed?: number;
  /** OCR engine used */
  ocrEngine?: string;
  /** Structured provenance for enterprise audit */
  provenance?: {
    textLayerAttempt: boolean;
    textLayerSuccess: boolean;
    textLayerEngine: string;
    textLayerChars: number;
    ocrAttempt: boolean;
    ocrSuccess: boolean;
    ocrEngine: string;
    ocrConfidence: number;
    ocrPagesProcessed: number;
    sources: string[];
  };
}

/**
 * OCR fallback options for metadata extraction
 */
export interface OcrFallbackOptions {
  /**
   * OCR engine to use.
   * - 'pdf_text': use embedded PDF text layer only
   * - 'tesseract': use tesseract.js
   * - 'ocrmypdf': use ocrmypdf binary (requires installation)
   * - 'vision_api': use cloud vision API (not implemented)
   * - 'native': use native PDF text layer with fallback to tesseract
   * Default: 'native' (PDF text layer first, then tesseract)
   */
  ocrEngine?: 'pdf_text' | 'tesseract' | 'ocrmypdf' | 'vision_api' | 'native';

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
   */
  renderScale?: number;
  renderMaxWidth?: number;
  renderFormat?: 'png' | 'jpeg';
  renderQuality?: number;

  /**
   * If we reach >= this confidence, we can mark needsManualReview false.
   * Default: 70
   */
  autoAcceptConfidenceThreshold?: number;

  /**
   * Whether to return raw OCR text in results.
   * Default: false
   */
  returnRawOcrText?: boolean;

  /**
   * Minimum characters to consider "meaningful text" for early-stop.
   * Default: 50
   */
  minMeaningfulChars?: number;

  /**
   * Maximum pages to OCR when using full-page OCR.
   * Default: 3
   */
  maxOcrPages?: number;
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
/**
 * Enterprise-grade OCR fallback metadata extraction.
 * This is the function you should call when LLMs are not available.
 *
 * It never throws; it always returns a usable OCRMetadata payload.
 *
 * @param params.pdfBuffer - Raw PDF buffer
 * @param params.filename - Original filename (for fallback parsing)
 * @param params.options - OCR configuration options
 * @returns OCRMetadata with title, composer, confidence scores
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
    ocrEngine = 'native',
    maxTextProbePages = DEFAULT_MAX_TEXT_PROBE_PAGES,
    enableTesseractOcr = true,
    ocrMode = 'both',
    renderScale = DEFAULT_RENDER_SCALE,
    renderMaxWidth = DEFAULT_RENDER_MAX_WIDTH,
    renderFormat = DEFAULT_RENDER_FORMAT,
    renderQuality = DEFAULT_RENDER_QUALITY,
    autoAcceptConfidenceThreshold = DEFAULT_AUTO_ACCEPT_CONFIDENCE_THRESHOLD,
    returnRawOcrText = false,
    minMeaningfulChars = DEFAULT_MIN_MEANINGFUL_CHARS,
    maxOcrPages = DEFAULT_MAX_OCR_PAGES,
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

  // 0.5) PDF document-info metadata (pdf-lib — no rendering, no LLM)
  try {
    const pdfLib = await import('pdf-lib').catch(() => null);
    if (pdfLib?.PDFDocument) {
      const doc = await pdfLib.PDFDocument.load(pdfBuffer, {
        ignoreEncryption: true,
        updateMetadata: false,
      } as any);
      const rawTitle = doc.getTitle?.()?.trim();
      const rawAuthor = doc.getAuthor?.()?.trim();
      const rawSubject = doc.getSubject?.()?.trim();

      if (rawTitle && rawTitle.length >= 2) {
        const composerCandidate = rawAuthor || rawSubject || undefined;
        const confidence = composerCandidate ? 80 : 70;
        const infoResult: OCRMetadata = {
          title: normalizeWhitespace(rawTitle),
          composer: composerCandidate ? normalizeWhitespace(composerCandidate) : undefined,
          confidence,
          isImageScanned: false,
          needsManualReview: confidence < autoAcceptConfidenceThreshold,
        };
        logger.info('OCR fallback: using PDF document-info metadata (highest confidence)', {
          filename: fileSafe,
          confidence,
          durationMs: Math.round(nowMs() - start),
        });
        return infoResult;
      }
    }
  } catch {
    // Non-fatal — continue to text-layer extraction
  }

  // 1) Attempt text-layer extraction first (fast and deterministic)
  // Incremental probing: stop early when meaningful text is found
  try {
    // Single call — parse all probe pages in one pass.
    // The previous O(n²) loop (calling extractPdfPageHeaders once per page) is
    // replaced with a single call; we iterate the returned headers to compute the
    // same hasMeaningfulText / pagesScanned / totalChars statistics cheaply.
    const extraction = await extractPdfPageHeaders(pdfBuffer, { maxPages: maxTextProbePages });
    const isImageScanned = !extraction.hasTextLayer || extraction.textLayerCoverage < 0.4;

    let pagesScanned = 0;
    let totalChars = 0;

    if (!isImageScanned) {
      for (let i = 0; i < extraction.pageHeaders.length; i++) {
        const pageText  = extraction.pageHeaders[i]?.fullText  || '';
        const headerText = extraction.pageHeaders[i]?.headerText || '';
        const combinedLength = (pageText + headerText).length;
        totalChars += combinedLength;
        pagesScanned++;
        // Stop scanning once we've found substantial text on any page
        if (combinedLength >= minMeaningfulChars) break;
      }
    }

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
        pagesScanned,
        charsExtracted: totalChars,
        minMeaningfulChars,
        durationMs: Math.round(nowMs() - start),
      });

      return result;
    }

    // If we have a strong text layer but couldn't parse title
    if (!isImageScanned) {
      logger.info(
        'OCR fallback: PDF has text layer but title parse was inconclusive; using filename fallback',
        {
          filename: fileSafe,
          hasTextLayer: extraction.hasTextLayer,
          textLayerCoverage: extraction.textLayerCoverage,
          pagesScanned,
          charsExtracted: totalChars,
          durationMs: Math.round(nowMs() - start),
        }
      );

      return {
        ...filenameFallback,
        isImageScanned,
      };
    }

    // If scanned, continue to OCR attempt below
    logger.info('OCR fallback: PDF appears scanned; proceeding to OCR attempt', {
      filename: fileSafe,
      hasTextLayer: extraction.hasTextLayer,
      textLayerCoverage: extraction.textLayerCoverage,
      ocrEngine,
      durationMs: Math.round(nowMs() - start),
    });
  } catch (err) {
    const details = safeErrorDetails(err);
    logger.warn('OCR fallback: text-layer probe failed; proceeding to OCR attempt', {
      filename: fileSafe,
      ...details,
    });
  }

  // 2) Attempt OCR on rendered image(s), if enabled
  if (enableTesseractOcr && (ocrEngine === 'tesseract' || ocrEngine === 'native')) {
    try {
      let ocrText = '';
      let totalOcrChars = 0;
      let totalPagesScanned = 0;

      if (ocrMode === 'header' || ocrMode === 'both') {
        const CROP_FRACTIONS = [0.20, 0.25, 0.40];
        let bestHeaderText = '';

        for (const cropFraction of CROP_FRACTIONS) {
          const crops = await renderPdfHeaderCropBatch(pdfBuffer, [0], {
            scale: renderScale,
            maxWidth: renderMaxWidth,
            quality: renderQuality,
            format: renderFormat,
            cropHeightFraction: cropFraction,
          });

          if (crops?.[0]) {
            let cropBase64 = crops[0];
            try {
              cropBase64 = await preprocessForOcr(cropBase64);
            } catch { /* preprocessing optional */ }

            const result = await tryOcrBase64ImageToText(cropBase64);
            totalOcrChars += result.length;
            totalPagesScanned++;

            if (result && result.trim().length > bestHeaderText.length) {
              bestHeaderText = result;
            }
          }
        }

        ocrText = bestHeaderText;
      }

      if (
        (!ocrText || ocrText.trim().length < 8) &&
        (ocrMode === 'full' || ocrMode === 'both')
      ) {
        for (let pageIdx = 0; pageIdx < maxOcrPages; pageIdx++) {
          const page = await renderPdfToImage(pdfBuffer, {
            pageIndex: pageIdx,
            scale: renderScale,
            maxWidth: renderMaxWidth,
            quality: renderQuality,
            format: renderFormat,
          });

          if (page) {
            let processed = page;
            try {
              processed = await preprocessForOcr(page);
            } catch { /* preprocessing optional */ }

            const result = await tryOcrBase64ImageToText(processed);
            totalOcrChars += result.length;
            totalPagesScanned++;

            if (result && result.length > ocrText.length) {
              ocrText = result;
            }
          }
        }
      }

      const tc = extractTitleComposerFromText(ocrText);

      if (tc.title) {
        const confidence = tc.composer ? 55 : 45;
        const result: OCRMetadata = {
          title: tc.title,
          composer: tc.composer,
          confidence,
          isImageScanned: true,
          needsManualReview: confidence < autoAcceptConfidenceThreshold,
        };

        if (returnRawOcrText) {
          result.rawOcrText = ocrText;
        }

        logger.info('OCR fallback: extracted metadata via OCR', {
          filename: fileSafe,
          confidence: result.confidence,
          durationMs: Math.round(nowMs() - start),
          ocrMode,
          ocrEngine,
          pagesScanned: totalPagesScanned,
          charsExtracted: totalOcrChars,
        });

        return result;
      }

      // Log empty/low-confidence outcome (metrics only)
      logger.info('OCR fallback: OCR completed but metadata parse inconclusive; using filename fallback', {
        filename: fileSafe,
        durationMs: Math.round(nowMs() - start),
        ocrMode,
        ocrEngine,
        pagesScanned: totalPagesScanned,
        charsExtracted: totalOcrChars,
        hasTitle: !!tc.title,
        hasComposer: !!tc.composer,
      });
    } catch (err) {
      const details = safeErrorDetails(err);
      logger.warn('OCR fallback: OCR path failed; using filename fallback', {
        filename: fileSafe,
        ...details,
      });
    }
  } else if (ocrEngine === 'ocrmypdf') {
    // Try ocrmypdf on the full PDF
    try {
      const result = await runOcrmypdf(pdfBuffer);

      if (result.text) {
        const tc = extractTitleComposerFromText(result.text);

        if (tc.title) {
          const confidence = tc.composer ? 60 : 50;
          const metadata: OCRMetadata = {
            title: tc.title,
            composer: tc.composer,
            confidence,
            isImageScanned: true,
            needsManualReview: confidence < autoAcceptConfidenceThreshold,
          };

          if (returnRawOcrText) {
            metadata.rawOcrText = result.text;
          }

          logger.info('OCR fallback: extracted metadata via ocrmypdf', {
            filename: fileSafe,
            confidence: metadata.confidence,
            durationMs: Math.round(nowMs() - start),
            charsExtracted: result.text.length,
          });

          return metadata;
        }
      }

      logger.info('OCR fallback: ocrmypdf completed but metadata parse inconclusive', {
        filename: fileSafe,
        durationMs: Math.round(nowMs() - start),
        charsExtracted: result.text.length,
      });
    } catch (err) {
      const details = safeErrorDetails(err);
      logger.warn('OCR fallback: ocrmypdf path failed; using filename fallback', {
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

    // Check if first part is just a track/sequence number (like "01" or "1") - skip it entirely
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


// =============================================================================
// New OCR Engine Functions (Phase 3)
// =============================================================================

/** Default constants for OCR fallback */
const DEFAULT_MAX_TEXT_PROBE_PAGES = 3;
const DEFAULT_MAX_OCR_PAGES = 3;
const DEFAULT_MIN_MEANINGFUL_CHARS = 50;
const DEFAULT_RENDER_SCALE = 2;
const DEFAULT_RENDER_MAX_WIDTH = 1024;
const DEFAULT_RENDER_FORMAT: 'png' | 'jpeg' = 'png';
const DEFAULT_RENDER_QUALITY = 85;
const DEFAULT_AUTO_ACCEPT_CONFIDENCE_THRESHOLD = 70;

/**
 * Try OCR using tesseract.js on a base64 image
 */
async function tryTesseractOcrOnImage(base64Image: string): Promise<{ text: string; confidence: number }> {
  const start = nowMs();

  try {
    const mod = await import('tesseract.js').catch(() => null);
    if (!mod?.recognize) {
      logger.warn('OCR engine unavailable (tesseract.js not installed)');
      return { text: '', confidence: 0 };
    }

    const dataUrl = `data:image/png;base64,${base64Image}`;
    const result: any = await mod.recognize(dataUrl, 'eng', {
      logger: () => undefined,
    });

    const text = typeof result?.data?.text === 'string' ? result.data.text : '';
    const confidence = typeof result?.data?.confidence === 'number' ? result.data.confidence : 0;

    logger.info('OCR (tesseract) completed', {
      durationMs: Math.round(nowMs() - start),
      extractedChars: text.length,
      confidence,
    });

    return { text, confidence };
  } catch (err) {
    const details = safeErrorDetails(err);
    logger.warn('OCR (tesseract) failed', {
      ...details,
      durationMs: Math.round(nowMs() - start),
    });
    return { text: '', confidence: 0 };
  }
}

/**
 * Try OCR using ocrmypdf binary
 * Writes PDF to temp file, runs ocrmypdf, reads output PDF, extracts text
 */
export async function runOcrmypdf(buffer: Buffer): Promise<{ text: string; confidence: number }> {
  const start = nowMs();

  // import fs once before entering the Promise body so we can use await at top level
  const fs: any = await import('fs').catch(() => null);
  return new Promise((resolve) => {
    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `ocr_input_${Date.now()}.pdf`);
    const outputPath = path.join(tmpDir, `ocr_output_${Date.now()}.pdf`);

    if (fs) {
      fs.writeFileSync(inputPath, buffer);
    }

    const ocrmypdf = spawn('ocrmypdf', [
      '--skip-text',
      '--force-ocr',
      '-q',
      inputPath,
      outputPath,
    ]);

    let stderr = '';

    ocrmypdf.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    ocrmypdf.on('close', async (code: number) => {
      try {
        if (fs) {
          fs.unlinkSync(inputPath);
        }
      } catch { /* ignore */ }

      if (code !== 0) {
        logger.warn('OCR (ocrmypdf) failed', {
          exitCode: code,
          stderr: stderr.slice(0, 200),
          durationMs: Math.round(nowMs() - start),
        });

        try {
          if (fs && fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
          }
        } catch { /* ignore */ }

        resolve({ text: '', confidence: 0 });
        return;
      }

      try {
        if (fs) {
          const outputBuffer = fs.readFileSync(outputPath);

          // Use pdfjs-dist to extract text — pdf-lib does NOT have a getTextContent() API.
          // ocrmypdf embeds a text layer in the output PDF, which pdfjs can read.
          const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs').catch(() => null);

          if (!pdfjsLib?.getDocument) {
            throw new Error('pdfjs-dist not available');
          }

          type PdfGetDocumentParams = Parameters<typeof pdfjsLib.getDocument>[0];

          const pdfData = new Uint8Array(outputBuffer);
          let loadingTask: any;
          let pdfDocument: any;
          let fullText = '';
          let pagesScanned = 0;

          try {
            loadingTask = pdfjsLib.getDocument({
              data: pdfData,
              disableWorker: true,
            } as unknown as PdfGetDocumentParams);

            pdfDocument = await loadingTask.promise;
            const numPages: number = pdfDocument.numPages;
            const pagesToRead = Math.min(numPages, DEFAULT_MAX_OCR_PAGES);

            for (let i = 1; i <= pagesToRead; i++) {
              try {
                const page = await pdfDocument.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items
                  .filter((item: any) => 'str' in item)
                  .map((item: any) => (item as any).str)
                  .join(' ');
                if (pageText.trim()) {
                  fullText += pageText + '\n';
                }
                pagesScanned++;
              } catch {
                // skip individual page failures
              }
            }
          } finally {
            try { if (loadingTask?.destroy) await loadingTask.destroy(); } catch { /* ok */ }
          }

          try {
            if (fs) {
              fs.unlinkSync(outputPath);
            }
          } catch { /* ignore */ }

          logger.info('OCR (ocrmypdf) completed', {
            durationMs: Math.round(nowMs() - start),
            pagesScanned,
            extractedChars: fullText.length,
          });

          resolve({ text: fullText, confidence: 75 });
        } else {
          resolve({ text: '', confidence: 0 });
        }
      } catch (err) {
        const details = safeErrorDetails(err);
        logger.warn('OCR (ocrmypdf) post-process failed', {
          ...details,
          durationMs: Math.round(nowMs() - start),
        });

        try {
          if (fs && fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
          }
        } catch { /* ignore */ }

        resolve({ text: '', confidence: 0 });
      }
    });

    ocrmypdf.on('error', (err: Error) => {
      logger.warn('OCR (ocrmypdf) spawn failed', {
        errorMessage: err.message,
        durationMs: Math.round(nowMs() - start),
      });

      try {
        if (fs) {
          fs.unlinkSync(inputPath);
        }
      } catch { /* ignore */ }

      resolve({ text: '', confidence: 0 });
    });
  });
}

/**
 * Generalized OCR engine runner
 */
export async function tryOcrEngine(
  base64Image: string,
  engine: 'tesseract' | 'ocrmypdf' | 'vision_api' | 'native',
  _options?: { returnRawText?: boolean }
): Promise<{ text: string; confidence: number; engine: string; pagesScanned: number; charsExtracted: number }> {
  switch (engine) {
    case 'tesseract': {
      const result = await tryTesseractOcrOnImage(base64Image);
      return {
        text: result.text,
        confidence: result.confidence,
        engine: 'tesseract',
        pagesScanned: 1,
        charsExtracted: result.text.length,
      };
    }

    case 'ocrmypdf': {
      logger.warn('OCR engine ocrmypdf requires PDF buffer, not image');
      return {
        text: '',
        confidence: 0,
        engine: 'ocrmypdf',
        pagesScanned: 0,
        charsExtracted: 0,
      };
    }

    case 'vision_api': {
      logger.warn('OCR engine vision_api not yet implemented');
      return {
        text: '',
        confidence: 0,
        engine: 'vision_api',
        pagesScanned: 0,
        charsExtracted: 0,
      };
    }

    case 'native':
    default: {
      const result = await tryTesseractOcrOnImage(base64Image);
      return {
        text: result.text,
        confidence: result.confidence,
        engine: 'tesseract',
        pagesScanned: 1,
        charsExtracted: result.text.length,
      };
    }
  }
}

/**
 * Check if ocrmypdf binary is available
 */
export async function isOcrmypdfAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('ocrmypdf', ['--version']);
    proc.on('close', (code) => {
      resolve(code === 0);
    });
    proc.on('error', () => {
      resolve(false);
    });
  });
}
