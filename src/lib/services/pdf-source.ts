import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument } from 'pdf-lib';
import { logger } from '@/lib/logger';

export interface PdfSourceInfo {
  pageCount: number;
  parser: 'pdf-lib' | 'pdfjs';
}

export interface PdfOpenResult {
  pdfDoc: PDFDocument;
  pageCount: number;
}

function hasPdfMagicBytes(pdfBuffer: Buffer): boolean {
  const magicBytes = pdfBuffer.slice(0, 5).toString('utf8');
  return magicBytes.startsWith('%PDF');
}

async function getPdfJsPageCount(pdfBuffer: Buffer): Promise<number> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    disableWorker: true,
    isEvalSupported: false,
  } as any);

  try {
    const pdfDoc = await loadingTask.promise;
    return Number(pdfDoc?.numPages ?? 0);
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}

export async function getPdfSourceInfo(pdfBuffer: Buffer): Promise<PdfSourceInfo> {
  if (!hasPdfMagicBytes(pdfBuffer)) {
    throw new Error('Not a valid PDF file (missing magic bytes)');
  }

  try {
    const pdfDoc = await PDFDocument.load(new Uint8Array(pdfBuffer), { ignoreEncryption: true });
    const pageCount = pdfDoc.getPageCount();
    if (pageCount > 0) {
      return { pageCount, parser: 'pdf-lib' };
    }
  } catch {
    // fall through to pdfjs
  }

  const pageCount = await getPdfJsPageCount(pdfBuffer);
  if (pageCount > 0) {
    return { pageCount, parser: 'pdfjs' };
  }

  throw new Error('Unable to determine PDF page count');
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
