import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { renderPdfToImage } from '@/lib/services/pdf-renderer';
import { generateOCRFallback, parseFilenameMetadata } from '@/lib/services/ocr-fallback';
import { splitPdfByPageRanges, validatePdfBuffer } from '@/lib/services/pdf-splitter';
import { analyzePdfParts } from '@/lib/services/pdf-part-detector';
import fs from 'fs';
import path from 'path';

// Test fixtures directory
const fixturesDir = path.join(__dirname, '__fixtures__');

// Create fixtures directory if it doesn't exist
if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true });
}

// Sample PDF for testing (minimal valid PDF)
const samplePdfPath = path.join(fixturesDir, 'sample.pdf');
const multipagePdfPath = path.join(fixturesDir, 'multipage.pdf');
const corruptedPdfPath = path.join(fixturesDir, 'corrupted.pdf');

describe('PDF Renderer Service', () => {
  // Create a minimal valid PDF for testing if it doesn't exist
  beforeAll(() => {
    // Minimal PDF content (first page only)
    const minimalPdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT
/F1 12 Tf
100 700 Td
(Test PDF) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000214 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
308
%%EOF`;

    fs.writeFileSync(samplePdfPath, minimalPdf);
    fs.writeFileSync(multipagePdfPath, minimalPdf);
    fs.writeFileSync(corruptedPdfPath, Buffer.from('Not a real PDF'));
  });

  afterAll(() => {
    // Clean up test files
    try {
      if (fs.existsSync(samplePdfPath)) fs.unlinkSync(samplePdfPath);
      if (fs.existsSync(multipagePdfPath)) fs.unlinkSync(multipagePdfPath);
      if (fs.existsSync(corruptedPdfPath)) fs.unlinkSync(corruptedPdfPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('renderPdfToImage', () => {
    it('should render valid PDF to base64 image', async () => {
      const pdfBuffer = fs.readFileSync(samplePdfPath);
      const base64 = await renderPdfToImage(pdfBuffer);

      // Verify it's not the placeholder
      expect(base64.length).toBeGreaterThan(1000);
      // PNG magic bytes in base64
      expect(base64).toMatch(/^iVBORw0KGgo/);
    });

    it('should throw error for corrupted PDF', async () => {
      const corruptedPdf = Buffer.from('Not a real PDF');

      await expect(renderPdfToImage(corruptedPdf)).rejects.toThrow();
    });

    it('should handle multi-page PDF (render first page only)', async () => {
      const pdfBuffer = fs.readFileSync(multipagePdfPath);

      const base64 = await renderPdfToImage(pdfBuffer, { pageIndex: 0 });

      expect(base64.length).toBeGreaterThan(1000);
    });

    it('should respect maxWidth option', async () => {
      const pdfBuffer = fs.readFileSync(samplePdfPath);

      const base64 = await renderPdfToImage(pdfBuffer, { maxWidth: 800 });

      expect(base64.length).toBeGreaterThan(0);
    });

    it('should output jpeg format when specified', async () => {
      const pdfBuffer = fs.readFileSync(samplePdfPath);

      const base64 = await renderPdfToImage(pdfBuffer, { format: 'jpeg' });

      // JPEG starts with different base64 header
      expect(base64.length).toBeGreaterThan(0);
    });
  });
});

describe('OCR Fallback Service', () => {
  describe('generateOCRFallback', () => {
    it('should extract title from filename', () => {
      const result = generateOCRFallback('Arabesque woods.pdf');

      expect(result.title).toBe('Arabesque woods');
      expect(result.confidence).toBe(25);
      expect(result.isImageScanned).toBe(true);
      expect(result.needsManualReview).toBe(true);
    });

    it('should extract composer from "Composer - Title" pattern', () => {
      const result = generateOCRFallback('John Smith - Amazing Grace.pdf');

      expect(result.title).toBe('Amazing Grace');
      expect(result.composer).toBe('John Smith');
      expect(result.confidence).toBe(35);
    });

    it('should handle filenames with underscores', () => {
      const result = generateOCRFallback('Beethoven_Symphony_No_5.pdf');

      expect(result.title).toBe('Beethoven Symphony No 5');
      expect(result.confidence).toBe(25);
    });

    it('should handle filenames with leading numbers', () => {
      const result = generateOCRFallback('01 - March - Stars and Stripes.pdf');

      expect(result.title).toBe('March - Stars and Stripes');
      expect(result.confidence).toBe(25);
    });
  });

  describe('parseFilenameMetadata', () => {
    it('should detect part patterns', () => {
      const result = parseFilenameMetadata('Part 1 - Flute.pdf');

      expect(result.title).toBeDefined();
      expect(result.confidence).toBe(30);
    });

    it('should detect conductor score', () => {
      const result = parseFilenameMetadata('Conductor Score - Stars and Stripes.pdf');

      expect(result.title).toBeDefined();
      expect(result.confidence).toBe(35);
    });

    it('should detect full score', () => {
      const result = parseFilenameMetadata('Full Score - Symphony No 9.pdf');

      expect(result.title).toBeDefined();
      expect(result.confidence).toBe(35);
    });
  });
});

describe('PDF Splitter Service', () => {
  describe('validatePdfBuffer', () => {
    it('should validate a real PDF', async () => {
      const pdfBuffer = fs.readFileSync(samplePdfPath);
      const result = await validatePdfBuffer(pdfBuffer);

      expect(result.valid).toBe(true);
      expect(result.pageCount).toBe(1);
    });

    it('should reject corrupted PDF', async () => {
      const corruptedPdf = Buffer.from('Not a real PDF');
      const result = await validatePdfBuffer(corruptedPdf);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('splitPdfByPageRanges', () => {
    it('should return original when no ranges provided', async () => {
      const pdfBuffer = fs.readFileSync(samplePdfPath);
      const result = await splitPdfByPageRanges(pdfBuffer, []);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('unsplit.pdf');
    });

    it('should split PDF into parts', async () => {
      const pdfBuffer = fs.readFileSync(samplePdfPath);
      const result = await splitPdfByPageRanges(pdfBuffer, [
        { start: 0, end: 0, name: 'page1.pdf' },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('page1.pdf');
      expect(result[0].buffer.length).toBeGreaterThan(0);
    });
  });
});

describe('PDF Part Detector Service', () => {
  describe('analyzePdfParts', () => {
    it('should analyze PDF for parts', async () => {
      const pdfBuffer = fs.readFileSync(samplePdfPath);
      const result = await analyzePdfParts(pdfBuffer, null);

      expect(result.totalPages).toBe(1);
      expect(result.isMultiPart).toBe(false);
      expect(result.confidence).toBeGreaterThan(50);
    });

    it('should detect multi-part from metadata', async () => {
      const pdfBuffer = fs.readFileSync(samplePdfPath);
      const metadata = {
        isMultiPart: true,
        parts: [
          { instrument: 'Flute', partName: 'Flute 1' },
          { instrument: 'Clarinet', partName: 'Clarinet 1' },
        ],
      };

      const result = await analyzePdfParts(pdfBuffer, metadata);

      expect(result.isMultiPart).toBe(true);
      expect(result.estimatedParts).toHaveLength(2);
    });
  });
});
