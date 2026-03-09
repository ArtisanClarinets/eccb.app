import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { logger } from '@/lib/logger';

export interface PdfOpenResult {
  pdfDoc: PDFDocument;
  pageCount: number;
}

export type PdfPageCountSource = 'pdf-lib' | 'pdfjs';

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

async function getPageCountViaPdfJs(pdfBuffer: Buffer): Promise<number | null> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    stopAtErrors: false,
    isEvalSupported: false,
    useSystemFonts: false,
    verbosity: 0,
  });

  try {
    const pdf = await loadingTask.promise;
    return selectAuthoritativePageCount(pdf.numPages);
  } finally {
    await loadingTask.destroy();
  }
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

export async function getAuthoritativePdfPageCount(
  pdfBuffer: Buffer,
): Promise<number | null> {
  try {
    const { pageCount } = await openPdfDocument(pdfBuffer);
    const normalized = selectAuthoritativePageCount(pageCount);
    if (normalized !== null) {
      return normalized;
    }
  } catch (error) {
    logger.warn('pdf-source: pdf-lib page count failed, trying pdfjs fallback', {
      error: asError(error).message,
    });
  }

  try {
    return await getPageCountViaPdfJs(pdfBuffer);
  } catch (error) {
    logger.warn('pdf-source: pdfjs page count fallback failed', {
      error: asError(error).message,
    });
    return null;
  }
}
