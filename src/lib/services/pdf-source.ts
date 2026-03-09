import { createRequire } from 'module';
import * as fs from 'fs';
import * as nodePath from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument } from 'pdf-lib';
import { logger } from '@/lib/logger';
import { pathToFileURL } from 'url';

// Turbopack worker fix: point pdfjs fake worker at absolute URL
const PDFJS_DIST_DIR_ABS = resolvePdfJsDistDir();
const WORKER_PATH = nodePath.join(PDFJS_DIST_DIR_ABS, 'legacy', 'build', 'pdf.worker.mjs');
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(WORKER_PATH).href;

export interface PdfSourceInfo {
  pageCount: number;
  parser: 'pdf-lib' | 'pdfjs';
}

export interface PdfOpenResult {
  pdfDoc: PDFDocument;
  pageCount: number;
}

type PdfGetDocumentParams = Parameters<typeof pdfjsLib.getDocument>[0];

interface PdfJsDocumentLike {
  numPages: number;
  cleanup?(): void | Promise<void>;
  destroy?(): void | Promise<void>;
}

interface PdfJsLoadingTaskLike<TDocument> {
  promise: Promise<TDocument>;
  destroy?(): void | Promise<void>;
  onPassword?: ((updatePassword: (password: string) => void, reason: number) => void) | null;
}

const PDF_BUFFER_HEADER_SEARCH_BYTES = 1024;
const PDF_LIB_LOAD_OPTIONS = {
  ignoreEncryption: true,
  updateMetadata: false,
} as const;

// ---------------------------------------------------------------------------
// Resolve pdfjs-dist asset directories robustly from the installed package.
// Falls back to cwd-relative node_modules to preserve current behavior.
// ---------------------------------------------------------------------------
const require = createRequire(import.meta.url);

function resolvePdfJsDistDir(): string {
  try {
    const pdfJsEntry = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
    return nodePath.resolve(nodePath.dirname(pdfJsEntry), '..', '..');
  } catch {
    return nodePath.join(process.cwd(), 'node_modules', 'pdfjs-dist');
  }
}

const PDFJS_DIST_DIR = resolvePdfJsDistDir();
const CMAP_DIR = nodePath.join(PDFJS_DIST_DIR, 'cmaps');
const FONTS_DIR = nodePath.join(PDFJS_DIST_DIR, 'standard_fonts');

// ---------------------------------------------------------------------------
// Node filesystem-backed factories.
// Mirrors the server-side setup used elsewhere in this feature pipeline so
// page-count probing behaves consistently with rendering/text extraction.
// ---------------------------------------------------------------------------
class NodeFsCMapReaderFactory {
  fetch({ name }: { name: string }): Promise<{ cMapData: Uint8Array; isCompressed: boolean }> {
    const bcmapPath = nodePath.join(CMAP_DIR, `${name}.bcmap`);
    const cmapPath = nodePath.join(CMAP_DIR, name);

    if (fs.existsSync(bcmapPath)) {
      return Promise.resolve({
        cMapData: new Uint8Array(fs.readFileSync(bcmapPath)),
        isCompressed: true,
      });
    }

    if (fs.existsSync(cmapPath)) {
      return Promise.resolve({
        cMapData: new Uint8Array(fs.readFileSync(cmapPath)),
        isCompressed: false,
      });
    }

    return Promise.reject(new Error(`CMap not found: ${name}`));
  }
}

class NodeFsStandardFontDataFactory {
  fetch({ filename }: { filename: string }): Promise<Uint8Array> {
    const fontPath = nodePath.join(FONTS_DIR, filename);

    if (fs.existsSync(fontPath)) {
      return Promise.resolve(new Uint8Array(fs.readFileSync(fontPath)));
    }

    return Promise.reject(new Error(`Standard font not found: ${filename}`));
  }
}

export function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function safeErrorDetails(err: unknown) {
  const error = asError(err);
  return {
    errorMessage: error.message,
    errorName: error.name,
    errorStack: error.stack,
  };
}

function hasPdfMagicBytes(pdfBuffer: Buffer): boolean {
  if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length < 5) {
    return false;
  }

  // Be slightly more tolerant than "first 5 bytes only" while still keeping the
  // check cheap and deterministic for malformed uploads.
  const header = pdfBuffer
    .subarray(0, Math.min(pdfBuffer.length, PDF_BUFFER_HEADER_SEARCH_BYTES))
    .toString('latin1');

  return header.includes('%PDF-');
}

function assertPdfBuffer(pdfBuffer: Buffer): void {
  if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
    throw new Error('PDF buffer is empty or invalid');
  }

  if (!hasPdfMagicBytes(pdfBuffer)) {
    throw new Error('Not a valid PDF file (missing magic bytes)');
  }
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

async function loadPdfDocumentWithPdfLib(pdfBuffer: Buffer): Promise<PDFDocument> {
  assertPdfBuffer(pdfBuffer);

  return PDFDocument.load(new Uint8Array(pdfBuffer), PDF_LIB_LOAD_OPTIONS);
}

function createPdfJsLoadingTask(pdfBuffer: Buffer): PdfJsLoadingTaskLike<PdfJsDocumentLike> {
  assertPdfBuffer(pdfBuffer);

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    disableWorker: true,
    stopAtErrors: false,
    isEvalSupported: false,
    useSystemFonts: false,
    verbosity: 0,
    CMapReaderFactory: NodeFsCMapReaderFactory,
    StandardFontDataFactory: NodeFsStandardFontDataFactory,
    cMapPacked: true,
  } as unknown as PdfGetDocumentParams) as unknown as PdfJsLoadingTaskLike<PdfJsDocumentLike>;

  if (loadingTask && typeof loadingTask === 'object' && 'onPassword' in loadingTask) {
    loadingTask.onPassword = (updatePassword) => {
      updatePassword('');
    };
  }

  return loadingTask;
}

async function cleanupPdfJsResources(
  loadingTask?: PdfJsLoadingTaskLike<PdfJsDocumentLike>,
  pdfDocument?: PdfJsDocumentLike,
): Promise<void> {
  try {
    if (pdfDocument && typeof pdfDocument.cleanup === 'function') {
      await pdfDocument.cleanup();
    }
  } catch {
    // best-effort cleanup only
  }

  try {
    if (loadingTask && typeof loadingTask.destroy === 'function') {
      await loadingTask.destroy();
    }
  } catch {
    // best-effort cleanup only
  }

  try {
    if (pdfDocument && typeof pdfDocument.destroy === 'function') {
      await pdfDocument.destroy();
    }
  } catch {
    // best-effort cleanup only
  }
}

async function getPageCountViaPdfJs(pdfBuffer: Buffer): Promise<number | null> {
  let loadingTask: PdfJsLoadingTaskLike<PdfJsDocumentLike> | undefined;
  let pdfDocument: PdfJsDocumentLike | undefined;

  try {
    loadingTask = createPdfJsLoadingTask(pdfBuffer);
    pdfDocument = await loadingTask.promise;
    return selectAuthoritativePageCount(pdfDocument.numPages);
  } finally {
    await cleanupPdfJsResources(loadingTask, pdfDocument);
  }
}

async function probePdfSource(pdfBuffer: Buffer): Promise<PdfSourceInfo | null> {
  try {
    const pdfDoc = await loadPdfDocumentWithPdfLib(pdfBuffer);
    const pageCount = selectAuthoritativePageCount(pdfDoc.getPageCount());

    if (pageCount !== null) {
      return { pageCount, parser: 'pdf-lib' };
    }

    logger.debug('pdf-source: pdf-lib returned invalid page count, trying pdfjs', {
      rawPageCount: pdfDoc.getPageCount(),
    });
  } catch (error) {
    const err = asError(error);
    logger.debug('pdf-source: pdf-lib probe failed, trying pdfjs', {
      errorMessage: err.message,
      errorName: err.name,
    });
  }

  try {
    const pageCount = await getPageCountViaPdfJs(pdfBuffer);
    if (pageCount !== null) {
      return { pageCount, parser: 'pdfjs' };
    }
  } catch (error) {
    const err = asError(error);
    logger.debug('pdf-source: pdfjs probe failed', {
      errorMessage: err.message,
      errorName: err.name,
    });
  }

  return null;
}

export async function getPdfSourceInfo(pdfBuffer: Buffer): Promise<PdfSourceInfo> {
  assertPdfBuffer(pdfBuffer);

  const sourceInfo = await probePdfSource(pdfBuffer);
  if (sourceInfo) {
    return sourceInfo;
  }

  throw new Error('Unable to determine PDF page count');
}

export async function openPdfDocument(pdfBuffer: Buffer): Promise<PdfOpenResult> {
  const pdfDoc = await loadPdfDocumentWithPdfLib(pdfBuffer);
  const pageCount = selectAuthoritativePageCount(pdfDoc.getPageCount());

  if (pageCount === null) {
    throw new Error('Unable to determine PDF page count via pdf-lib');
  }

  return {
    pdfDoc,
    pageCount,
  };
}

export async function getAuthoritativePdfPageCount(
  pdfBuffer: Buffer,
): Promise<number | null> {
  if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
    logger.warn('pdf-source: invalid PDF buffer');
    return null;
  }

  if (!hasPdfMagicBytes(pdfBuffer)) {
    logger.warn('pdf-source: invalid PDF magic bytes');
    return null;
  }

  const sourceInfo = await probePdfSource(pdfBuffer);
  if (sourceInfo) {
    return sourceInfo.pageCount;
  }

  logger.warn('pdf-source: unable to determine PDF page count with available parsers');
  return null;
}