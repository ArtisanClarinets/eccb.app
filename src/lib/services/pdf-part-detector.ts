/**
 * PDF Part Detection Service
 *
 * Analyzes extracted metadata and PDF structure to identify if it's a multi-part
 * score and which parts need to be split.
 *
 * Corp-grade goals:
 * - Never log PDF bytes or extracted text content
 * - Defensive parsing and stable return shapes
 * - Best-effort resource cleanup (pdfjs loadingTask)
 * - Per-stage structured logging with useful diagnostics
 *
 * IMPORTANT: Detection logic/heuristics are preserved (no behavior-breaking changes).
 */

import { logger } from '@/lib/logger';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// Server-side rendering uses disableWorker: true option in getDocument
// instead of setting workerSrc (pdfjs-dist v5 compatibility)

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

type PdfGetDocumentParams = Parameters<typeof pdfjsLib.getDocument>[0];

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function safeErrorDetails(err: unknown) {
  const e = asError(err);
  return {
    errorMessage: e.message,
    errorName: e.name,
    errorStack: e.stack,
  };
}

function nowMs(): number {
   
  const perf = (globalThis as any)?.performance;
  if (perf?.now) return perf.now();
  return Date.now();
}

async function destroyLoadingTask(loadingTask: unknown) {
  try {
     
    const task = loadingTask as any;
    if (task && typeof task.destroy === 'function') {
      await task.destroy();
    }
  } catch {
    // best-effort
  }
}

/**
 * Analyze PDF to detect multi-part structure.
 * Returns information about which pages belong to which parts.
 */
export async function analyzePdfParts(
  pdfBuffer: Buffer,
  extractedMetadata: ExtractedMetadata | null
): Promise<SmartUploadPartAnalysis> {
  const start = nowMs();

   
  let loadingTask: any | undefined;
   
  let pdfDocument: any | undefined;

  try {
    // Load PDF - convert Buffer to Uint8Array for pdfjs-dist compatibility
    const pdfData = new Uint8Array(pdfBuffer);
    loadingTask = pdfjsLib.getDocument({
      data: pdfData,
      disableWorker: true,
    } as unknown as PdfGetDocumentParams);

    pdfDocument = await loadingTask.promise;
    const totalPages: number = pdfDocument.numPages;

    logger.info('Analyzing PDF for multi-part structure', {
      totalPages,
      hasMetadataParts: Array.isArray(extractedMetadata?.parts) && extractedMetadata!.parts!.length > 0,
      metadataIsMultiPart: !!extractedMetadata?.isMultiPart,
    });

    // If metadata indicates multi-part, estimate page distribution
    if (
      extractedMetadata?.isMultiPart &&
      Array.isArray(extractedMetadata.parts) &&
      extractedMetadata.parts.length > 0
    ) {
      const partsCount = extractedMetadata.parts.length;

      // Estimate equal page distribution among parts
      // This is a simplified approach - in production, you'd analyze page content
      const pagesPerPart = Math.ceil(totalPages / partsCount);

      const parts: PartInfo[] = extractedMetadata.parts.map(
        (part: ExtractedMetadataPart, index: number) => {
          const startPage = index * pagesPerPart;
          const endPage = Math.min((index + 1) * pagesPerPart - 1, totalPages - 1);

          return {
            pageRange: [startPage, endPage] as [number, number],
            instrumentName: part.instrument || 'Unknown',
            partName: part.partName || `Part ${index + 1}`,
            estimatedPartNumber: index + 1,
          };
        }
      );

      // Adjust the last part to include any remaining pages
      if (parts.length > 0) {
        const lastPart = parts[parts.length - 1];
        lastPart.pageRange[1] = totalPages - 1;
      }

      logger.info('Multi-part detected from metadata', {
        totalPages,
        partsCount,
        pagesPerPart,
        durationMs: Math.round(nowMs() - start),
      });

      return {
        isMultiPart: true,
        totalPages,
        estimatedParts: parts,
        confidence: 60, // Moderate confidence without page header analysis
        notes:
          'Multi-part structure detected from LLM metadata. Page boundaries are estimates.',
      };
    }

    // Check if single PDF might have multiple parts based on page count
    // and common patterns
    const structureAnalysis = await analyzePdfStructure(pdfDocument, totalPages);

    if (structureAnalysis.potentialParts > 1) {
      logger.info('Multi-part detected from structure heuristics', {
        totalPages,
        potentialParts: structureAnalysis.potentialParts,
        confidence: structureAnalysis.confidence,
        durationMs: Math.round(nowMs() - start),
      });

      return {
        isMultiPart: true,
        totalPages,
        estimatedParts: structureAnalysis.parts,
        confidence: structureAnalysis.confidence,
        notes: structureAnalysis.notes,
      };
    }

    logger.info('Single-part detected', {
      totalPages,
      durationMs: Math.round(nowMs() - start),
    });

    return {
      isMultiPart: false,
      totalPages,
      estimatedParts: [],
      confidence: 85,
      notes: 'Single-part score detected.',
    };
  } catch (error) {
    const details = safeErrorDetails(error);
    logger.error('Failed to analyze PDF parts', {
      ...details,
      // no PDF bytes or text included
    });

    return {
      isMultiPart: false,
      totalPages: 0,
      estimatedParts: [],
      confidence: 0,
      notes: 'Error analyzing PDF: ' + asError(error).message,
    };
  } finally {
    // Best-effort cleanup
    try {
      if (pdfDocument && typeof pdfDocument.cleanup === 'function') {
        await pdfDocument.cleanup();
      }
    } catch {
      // ignore
    }
    await destroyLoadingTask(loadingTask);
  }
}

/**
 * Analyze PDF structure to detect potential multi-part layouts.
 * This uses heuristics such as page count and content patterns.
 *
 * NOTE: This preserves the existing heuristic logic exactly:
 * - <=2 pages => single
 * - otherwise potentialParts = min(ceil(totalPages/4), totalPages)
 * - consider multi-part if potentialParts>1 && totalPages>=4
 */
async function analyzePdfStructure(
   
  pdfDocument: pdfjsLib.PDFDocumentProxy,
  totalPages: number
): Promise<{
  potentialParts: number;
  parts: PartInfo[];
  confidence: number;
  notes: string;
}> {
  // For very short PDFs (1-2 pages), likely single part
  if (totalPages <= 2) {
    return {
      potentialParts: 1,
      parts: [],
      confidence: 90,
      notes: 'Single-part detected (few pages).',
    };
  }

  // For longer PDFs, try to detect structure
  // This is a simplified heuristic - real detection would require OCR or pattern matching
  const _estimatedPartsPerPage = 1; // Most parts are 1-4 pages
  const potentialParts = Math.min(Math.ceil(totalPages / 4), totalPages);

  // Only consider multi-part if we have a reasonable number of pages
  if (potentialParts > 1 && totalPages >= 4) {
    const parts: PartInfo[] = [];
    const pagesPerPart = Math.ceil(totalPages / potentialParts);

    for (let i = 0; i < potentialParts; i++) {
      parts.push({
        pageRange: [
          i * pagesPerPart,
          Math.min((i + 1) * pagesPerPart - 1, totalPages - 1),
        ],
        instrumentName: 'Unknown',
        partName: `Part ${i + 1}`,
        estimatedPartNumber: i + 1,
      });
    }

    return {
      potentialParts,
      parts,
      confidence: 30, // Low confidence - just a guess based on page count
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