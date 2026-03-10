import { describe, expect, it, vi } from 'vitest';

const { mockPdfLibLoad, mockPdfjsGetDocument } = vi.hoisted(() => ({
  mockPdfLibLoad: vi.fn(),
  mockPdfjsGetDocument: vi.fn(),
}));

vi.mock('pdf-lib', () => ({
  PDFDocument: {
    load: mockPdfLibLoad,
  },
}));

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: mockPdfjsGetDocument,
  GlobalWorkerOptions: {
    workerSrc: '',
  },
}));

import { getAuthoritativePdfPageCount } from '@/lib/services/pdf-source';

describe('pdf-source', () => {
  it('falls back to pdfjs when pdf-lib fails', async () => {
    mockPdfLibLoad.mockRejectedValueOnce(new Error('pdf-lib parse error'));
    const destroy = vi.fn().mockResolvedValue(undefined);
    mockPdfjsGetDocument.mockReturnValueOnce({
      promise: Promise.resolve({ numPages: 12 }),
      destroy,
    });

    const count = await getAuthoritativePdfPageCount(Buffer.from('%PDF-1.4 test'));

    expect(count).toBe(12);
    expect(destroy).toHaveBeenCalled();
  });

  it('returns null when all parsers fail', async () => {
    mockPdfLibLoad.mockRejectedValueOnce(new Error('pdf-lib fail'));
    const destroy = vi.fn().mockResolvedValue(undefined);
    mockPdfjsGetDocument.mockReturnValueOnce({
      promise: Promise.reject(new Error('pdfjs fail')),
      destroy,
    });

    const count = await getAuthoritativePdfPageCount(Buffer.from('%PDF-1.4 test'));
    expect(count).toBeNull();
  });
});
