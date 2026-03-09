import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument } from 'pdf-lib';

export interface PdfSourceInfo {
  pageCount: number;
  parser: 'pdf-lib' | 'pdfjs';
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
