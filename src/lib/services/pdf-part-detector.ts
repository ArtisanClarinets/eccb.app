/**
 * PDF Part Detection Service
 *
 * Analyzes extracted metadata and PDF structure to identify if it's a multi-part
 * score and which parts need to be split.
 *
 * Corp-grade goals:
 * - Never log PDF bytes or extracted text content
 * - Defensive parsing and stable return shapes
 * - Per-stage structured logging with useful diagnostics
 *
 * IMPORTANT: Detection logic/heuristics are preserved:
 * - metadata-driven multipart detection still takes priority
 * - equal page distribution is still used for metadata-based estimation
 * - structure heuristic remains:
 *   - <=2 pages => single
 *   - otherwise potentialParts = min(ceil(totalPages/4), totalPages)
 *   - consider multi-part if potentialParts>1 && totalPages>=4
 */

import { logger } from '@/lib/logger';
import { getAuthoritativePdfPageCount } from '@/lib/services/pdf-source';

export interface PartInfo {
  pageRange: [number, number]; // [startPage, endPage] (0-indexed)
  instrumentName: string;
  partName: string;
  estimatedPartNumber: number;
}

export interface SmartUploadPartAnalysis {
  isMultiPart: boolean;
  totalPages: number;
  estimatedParts: PartInfo[];
  confidence: number;
  notes: string;
}

interface ExtractedMetadataPart {
  instrument?: string;
  partName?: string;
}

interface ExtractedMetadata {
  isMultiPart?: boolean;
  parts?: ExtractedMetadataPart[];
}

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function nowMs(): number {
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  if (perf?.now) return perf.now();
  return Date.now();
}

function buildErrorResult(error: unknown): SmartUploadPartAnalysis {
  const err = asError(error);

  return {
    isMultiPart: false,
    totalPages: 0,
    estimatedParts: [],
    confidence: 0,
    notes: `Error analyzing PDF: ${err.message}`,
  };
}

function clampPageIndex(value: number, totalPages: number): number {
  if (totalPages <= 0) return 0;
  return Math.max(0, Math.min(totalPages - 1, Math.floor(value)));
}

function buildBoundedPageRange(
  startPage: number,
  endPage: number,
  totalPages: number,
): [number, number] {
  if (totalPages <= 0) {
    return [0, 0];
  }

  const boundedStart = clampPageIndex(startPage, totalPages);
  const boundedEnd = clampPageIndex(Math.max(startPage, endPage), totalPages);

  return boundedStart <= boundedEnd
    ? [boundedStart, boundedEnd]
    : [boundedStart, boundedStart];
}

function hasMetadataParts(
  extractedMetadata: ExtractedMetadata | null,
): extractedMetadata is ExtractedMetadata & { parts: ExtractedMetadataPart[] } {
  return !!(
    extractedMetadata &&
    Array.isArray(extractedMetadata.parts) &&
    extractedMetadata.parts.length > 0
  );
}

function estimatePartsFromMetadata(
  totalPages: number,
  metadataParts: ExtractedMetadataPart[],
): PartInfo[] {
  const partsCount = metadataParts.length;
  const pagesPerPart = Math.ceil(totalPages / partsCount);

  const parts = metadataParts.map((part, index) => {
    const startPage = index * pagesPerPart;
    const endPage = Math.min((index + 1) * pagesPerPart - 1, totalPages - 1);

    return {
      pageRange: buildBoundedPageRange(startPage, endPage, totalPages),
      instrumentName: part.instrument || 'Unknown',
      partName: part.partName || `Part ${index + 1}`,
      estimatedPartNumber: index + 1,
    };
  });

  if (parts.length > 0) {
    parts[parts.length - 1].pageRange = buildBoundedPageRange(
      parts[parts.length - 1].pageRange[0],
      totalPages - 1,
      totalPages,
    );
  }

  return parts;
}

/**
 * Analyze PDF structure to detect potential multi-part layouts.
 * This preserves the existing heuristic logic exactly:
 * - <=2 pages => single
 * - otherwise potentialParts = min(ceil(totalPages/4), totalPages)
 * - consider multi-part if potentialParts>1 && totalPages>=4
 */
function analyzePdfStructure(totalPages: number): {
  potentialParts: number;
  parts: PartInfo[];
  confidence: number;
  notes: string;
} {
  if (totalPages <= 2) {
    return {
      potentialParts: 1,
      parts: [],
      confidence: 90,
      notes: 'Single-part detected (few pages).',
    };
  }

  const potentialParts = Math.min(Math.ceil(totalPages / 4), totalPages);

  if (potentialParts > 1 && totalPages >= 4) {
    const parts: PartInfo[] = [];
    const pagesPerPart = Math.ceil(totalPages / potentialParts);

    for (let i = 0; i < potentialParts; i += 1) {
      parts.push({
        pageRange: buildBoundedPageRange(
          i * pagesPerPart,
          Math.min((i + 1) * pagesPerPart - 1, totalPages - 1),
          totalPages,
        ),
        instrumentName: 'Unknown',
        partName: `Part ${i + 1}`,
        estimatedPartNumber: i + 1,
      });
    }

    return {
      potentialParts,
      parts,
      confidence: 30,
      notes: `Detected ${potentialParts} potential parts based on page count (${totalPages} pages). Manual verification recommended.`,
    };
  }

  return {
    potentialParts: 1,
    parts: [],
    confidence: 50,
    notes: 'Structure analysis inconclusive.',
  };
}

/**
 * Analyze PDF to detect multi-part structure.
 * Returns information about which pages belong to which parts.
 */
export async function analyzePdfParts(
  pdfBuffer: Buffer,
  extractedMetadata: ExtractedMetadata | null,
): Promise<SmartUploadPartAnalysis> {
  const startMs = nowMs();

  try {
    if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
      throw new Error('PDF buffer is empty or invalid');
    }

    const totalPages = await getAuthoritativePdfPageCount(pdfBuffer);

    if (!totalPages || totalPages <= 0) {
      throw new Error('Unable to determine PDF page count');
    }

    logger.info('pdf-part-detector: analyzing PDF for multi-part structure', {
      totalPages,
      hasMetadataParts: hasMetadataParts(extractedMetadata),
      metadataIsMultiPart: !!extractedMetadata?.isMultiPart,
    });

    if (
      extractedMetadata?.isMultiPart &&
      hasMetadataParts(extractedMetadata)
    ) {
      const estimatedParts = estimatePartsFromMetadata(totalPages, extractedMetadata.parts);
      const pagesPerPart = Math.ceil(totalPages / extractedMetadata.parts.length);

      logger.info('pdf-part-detector: multi-part detected from metadata', {
        totalPages,
        partsCount: extractedMetadata.parts.length,
        pagesPerPart,
        durationMs: Math.round(nowMs() - startMs),
      });

      return {
        isMultiPart: true,
        totalPages,
        estimatedParts,
        confidence: 60,
        notes: 'Multi-part structure detected from LLM metadata. Page boundaries are estimates.',
      };
    }

    const structureAnalysis = analyzePdfStructure(totalPages);

    if (structureAnalysis.potentialParts > 1) {
      logger.info('pdf-part-detector: multi-part detected from structure heuristics', {
        totalPages,
        potentialParts: structureAnalysis.potentialParts,
        confidence: structureAnalysis.confidence,
        durationMs: Math.round(nowMs() - startMs),
      });

      return {
        isMultiPart: true,
        totalPages,
        estimatedParts: structureAnalysis.parts,
        confidence: structureAnalysis.confidence,
        notes: structureAnalysis.notes,
      };
    }

    logger.info('pdf-part-detector: single-part detected', {
      totalPages,
      durationMs: Math.round(nowMs() - startMs),
    });

    return {
      isMultiPart: false,
      totalPages,
      estimatedParts: [],
      confidence: 85,
      notes: 'Single-part score detected.',
    };
  } catch (error) {
    const err = asError(error);

    logger.error('pdf-part-detector: failed to analyze PDF parts', {
      errorMessage: err.message,
      errorName: err.name,
      errorStack: err.stack,
    });

    return buildErrorResult(error);
  }
}