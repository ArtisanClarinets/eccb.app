/**
 * PDF Part Detection Service
 *
 * Analyzes extracted metadata and PDF structure to identify if it's a multi-part
 * score and which parts need to be split.
 */

import { logger } from '@/lib/logger';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// Disable worker for server-side Node.js rendering
pdfjsLib.GlobalWorkerOptions.workerSrc = '';

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

/**
 * Analyze PDF to detect multi-part structure.
 * Returns information about which pages belong to which parts.
 */
export async function analyzePdfParts(
  pdfBuffer: Buffer,
  extractedMetadata: ExtractedMetadata | null
): Promise<SmartUploadPartAnalysis> {
  try {
    // Load PDF - convert Buffer to Uint8Array for pdfjs-dist compatibility
    const pdfData = new Uint8Array(pdfBuffer);
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    const pdfDocument = await loadingTask.promise;
    const totalPages = pdfDocument.numPages;

    logger.info('Analyzing PDF for multi-part structure', {
      totalPages,
      hasMetadataParts: !!extractedMetadata?.parts,
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
      return {
        isMultiPart: true,
        totalPages,
        estimatedParts: structureAnalysis.parts,
        confidence: structureAnalysis.confidence,
        notes: structureAnalysis.notes,
      };
    }

    return {
      isMultiPart: false,
      totalPages,
      estimatedParts: [],
      confidence: 85,
      notes: 'Single-part score detected.',
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to analyze PDF parts', err);
    return {
      isMultiPart: false,
      totalPages: 0,
      estimatedParts: [],
      confidence: 0,
      notes: 'Error analyzing PDF: ' + err.message,
    };
  }
}

/**
 * Analyze PDF structure to detect potential multi-part layouts.
 * This uses heuristics such as page count and content patterns.
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