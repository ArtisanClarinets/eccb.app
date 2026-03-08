import { PDFDocument } from 'pdf-lib';
import { logger } from '@/lib/logger';

export interface PdfOpenResult {
  pdfDoc: PDFDocument;
  pageCount: number;
}


function normalizePageCountCandidate(value: number | null | undefined): number | null {
  if (typeof value !== 'number') return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

export function selectAuthoritativePageCount(
  ...candidates: Array<number | null | undefined>
): number | null {
  for (const candidate of candidates) {
    const normalized = normalizePageCountCandidate(candidate);
    if (normalized !== null) return normalized;
  }
  return null;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export async function openPdfDocument(pdfBuffer: Buffer): Promise<PdfOpenResult> {
  const pdfDoc = await PDFDocument.load(new Uint8Array(pdfBuffer), {
    ignoreEncryption: true,
  });
  return {
    pdfDoc,
    pageCount: pdfDoc.getPageCount(),
  };
}

export async function getAuthoritativePdfPageCount(pdfBuffer: Buffer): Promise<number | null> {
  try {
    const { pageCount } = await openPdfDocument(pdfBuffer);
    return pageCount > 0 ? pageCount : null;
  } catch (error) {
    logger.warn('Unable to resolve PDF page count from centralized parser', {
      error: asError(error).message,
    });
    return null;
  }
}
