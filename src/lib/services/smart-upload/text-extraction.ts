/**
 * Text Extraction Service
 *
 * Provides PDF text extraction with OCR fallback capabilities.
 * Supports multiple extraction methods: pdf-parse, Tesseract, OCRmyPDF, and Vision API.
 */

import { PDFDocument } from 'pdf-lib';
import pdfParse from 'pdf-parse';

import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { PdfExtractionError } from './smart-upload.types';
import type { PdfExtractionResult, OcrMode } from './smart-upload.types';

// =============================================================================
// Type Declarations for pdf-parse
// =============================================================================

interface PdfParseData {
  numpages: number;
  numrender: number;
  info: Record<string, unknown>;
  metadata: Record<string, unknown>;
  text: string;
  version: string;
}

// =============================================================================
// Constants
// =============================================================================

const MIN_TEXT_LENGTH = 100;
const MIN_CONFIDENCE_THRESHOLD = 0.5;

/**
 * Minimum ratio of text to page count to consider the extraction successful.
 * If a PDF has very little text per page, OCR should be considered.
 */
const MIN_TEXT_PER_PAGE_RATIO = 10;

// =============================================================================
// Main Extraction Function
// =============================================================================

/**
 * Extract text from a PDF buffer.
 *
 * First attempts PDF text extraction using pdf-parse.
 * If the extracted text is too short or low quality, falls back to OCR
 * if configured in SMART_UPLOAD_OCR_MODE environment variable.
 *
 * @param buffer - PDF file buffer
 * @returns Promise resolving to PdfExtractionResult
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<PdfExtractionResult> {
  logger.info('Starting PDF text extraction', {
    bufferSize: buffer.length,
    ocrMode: env.SMART_UPLOAD_OCR_MODE,
  });

  // Validate PDF header
  if (!isValidPdf(buffer)) {
    throw new PdfExtractionError('Invalid PDF file: missing PDF header');
  }

  // Get page count using pdf-lib
  const pageCount = await getPdfPageCount(buffer);
  logger.debug('PDF page count', { pageCount });

  if (pageCount === 0) {
    return {
      text: '',
      pageCount: 0,
      method: 'pdf_parse',
      confidence: 1.0,
    };
  }

  // First attempt: PDF text extraction
  const pdfText = await extractPdfText(buffer);
  const textLength = pdfText.trim().length;

  logger.info('PDF text extraction completed', {
    textLength,
    pageCount,
    textPerPage: pageCount > 0 ? textLength / pageCount : 0,
  });

  // Check if OCR is needed
  const shouldUseOcrResult = shouldUseOcr(pdfText, pageCount);

  if (shouldUseOcrResult.shouldOcr) {
    logger.info('OCR fallback triggered', {
      reason: shouldUseOcrResult.reason,
      ocrMode: env.SMART_UPLOAD_OCR_MODE,
    });

    // Only use OCR if not in 'pdf_text' mode
    if (env.SMART_UPLOAD_OCR_MODE !== 'pdf_text') {
      try {
        const ocrText = await performOcr(buffer, env.SMART_UPLOAD_OCR_MODE);
        return {
          text: ocrText,
          pageCount,
          method: 'ocr',
          confidence: 0.8, // OCR confidence estimate
        };
      } catch (error) {
        logger.error('OCR fallback failed', { error });
        // Return PDF text as fallback if OCR fails
        return {
          text: pdfText,
          pageCount,
          method: 'pdf_parse',
          confidence: 0.5,
        };
      }
    }

    // If OCR mode is 'pdf_text', return what we have with lower confidence
    return {
      text: pdfText,
      pageCount,
      method: 'pdf_parse',
      confidence: shouldUseOcrResult.confidence,
    };
  }

  // Successful PDF text extraction
  return {
    text: pdfText,
    pageCount,
    method: 'pdf_parse',
    confidence: 1.0,
  };
}

// =============================================================================
// PDF Text Extraction
// =============================================================================

/**
 * Extract text from PDF using pdf-parse.
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(buffer) as PdfParseData;
    return data.text || '';
  } catch (error) {
    logger.error('pdf-parse failed', { error });
    // Check for common errors
    if (isPasswordProtected(buffer)) {
      throw new PdfExtractionError(
        'PDF is password protected. Please provide an unlocked PDF.',
        error
      );
    }
    throw new PdfExtractionError('Failed to extract text from PDF', error);
  }
}

/**
 * Get the number of pages in a PDF using pdf-lib.
 */
async function getPdfPageCount(buffer: Buffer): Promise<number> {
  try {
    const pdfDoc = await PDFDocument.load(buffer, {
      ignoreEncryption: true,
    });
    return pdfDoc.getPageCount();
  } catch (error) {
    logger.error('Failed to get PDF page count', { error });
    throw new PdfExtractionError('Failed to read PDF structure', error);
  }
}

// =============================================================================
// OCR Decision Logic
// =============================================================================

/**
 * Determines whether OCR should be used based on extracted text quality.
 *
 * @param text - Extracted text from PDF
 * @param pageCount - Number of pages in the PDF
 * @returns Object with shouldOcr flag and reason
 */
export function shouldUseOcr(text: string, pageCount: number): {
  shouldOcr: boolean;
  reason: string;
  confidence: number;
} {
  const textLength = text.trim().length;
  const textPerPage = pageCount > 0 ? textLength / pageCount : 0;

  // Check for empty or very short text
  if (textLength < MIN_TEXT_LENGTH) {
    return {
      shouldOcr: true,
      reason: `Text too short (${textLength} chars, minimum ${MIN_TEXT_LENGTH})`,
      confidence: 0.3,
    };
  }

  // Check for low text per page ratio (scanned document indicator)
  if (textPerPage < MIN_TEXT_PER_PAGE_RATIO) {
    return {
      shouldOcr: true,
      reason: `Low text density (${textPerPage.toFixed(1)} chars/page, expected > ${MIN_TEXT_PER_PAGE_RATIO})`,
      confidence: 0.4,
    };
  }

  // Check for excessive whitespace (potential OCR or image-only PDF)
  const whitespaceRatio = (text.match(/\s/g) || []).length / textLength;
  if (whitespaceRatio > 0.9) {
    return {
      shouldOcr: true,
      reason: `Excessive whitespace (${(whitespaceRatio * 100).toFixed(1)}%)`,
      confidence: 0.35,
    };
  }

  // Text looks good
  return {
    shouldOcr: false,
    reason: 'Text extraction successful',
    confidence: 1.0,
  };
}

// =============================================================================
// OCR Implementation (Stub)
// =============================================================================

/**
 * Perform OCR on a PDF buffer.
 *
 * Uses Tesseract.js to perform OCR on image-based PDFs.
 * Converts PDF pages to images first using pdf2pic, then runs OCR.
 *
 * @param buffer - PDF file buffer
 * @param mode - OCR mode to use
 * @returns Extracted text from OCR
 * @throws Error if OCR mode is not properly configured
 */
export async function performOcr(buffer: Buffer, mode: OcrMode): Promise<string> {
  logger.info('OCR requested', { mode, bufferSize: buffer.length });

  switch (mode) {
    case 'tesseract': {
      try {
        // Import dependencies dynamically
        const Tesseract = await import('tesseract.js');
        const { fromBuffer } = await import('pdf2pic');
        
        // Initialize pdf2pic converter
        const converter = fromBuffer(buffer, {
          density: 200, // 200 DPI for good OCR quality
          saveFilename: 'temp_ocr',
          savePath: '/tmp',
          format: 'png',
          width: 0, // Use original size
          height: 0,
        });
        
        // Get page count
        const pageCount = converter.pageCount;
        
        logger.info('Converting PDF pages to images for OCR', { pageCount });
        
        const texts: string[] = [];
        let totalConfidence = 0;
        
        // Process each page
        for (let pageIndex = 1; pageIndex <= pageCount; pageIndex++) {
          logger.debug('Processing page for OCR', { pageIndex, totalPages: pageCount });
          
          // Convert page to image
          const imageResult = await converter(pageIndex);
          
          if (!imageResult || !imageResult.path) {
            throw new Error(`Failed to convert page ${pageIndex} to image`);
          }
          
          // Run Tesseract OCR on the image
          const result = await Tesseract.recognize(imageResult.path, 'eng', {
            logger: (m) => {
              if (m.status === 'recognizing text') {
                logger.debug('Tesseract OCR progress', {
                  page: pageIndex,
                  progress: Math.round(m.progress * 100),
                });
              }
            },
          });
          
          texts.push(result.data.text.trim());
          totalConfidence += result.data.confidence;
          
          logger.debug('Page OCR completed', {
            pageIndex,
            confidence: result.data.confidence,
            textLength: result.data.text.length,
          });
        }
        
        const avgConfidence = pageCount > 0 ? totalConfidence / pageCount : 0;
        
        // Join all text with page separators
        const fullText = texts.join('\n\n--- Page Break ---\n\n');
        
        logger.info('OCR completed', {
          pageCount,
          totalTextLength: fullText.length,
          avgConfidence,
        });
        
        return fullText;
      } catch (error) {
        logger.error('Tesseract OCR failed', { error });
        throw new Error(
          `Tesseract OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    case 'ocrmypdf':
      throw new Error(
        'OCRmyPDF integration is not yet implemented. ' +
        'To enable OCR, either:\n' +
        '1. Set SMART_UPLOAD_OCR_MODE=pdf_text to skip OCR\n' +
        '2. Implement OCRmyPDF integration in src/lib/services/smart-upload/text-extraction.ts'
      );

    case 'vision_api':
      throw new Error(
        'Vision API OCR is not yet implemented. ' +
        'To enable OCR, either:\n' +
        '1. Set SMART_UPLOAD_OCR_MODE=pdf_text to skip OCR\n' +
        '2. Implement Vision API integration in src/lib/services/smart-upload/text-extraction.ts'
      );

    default:
      throw new Error(`Unknown OCR mode: ${mode}`);
  }
}

// =============================================================================
// PDF Validation Helpers
// =============================================================================

/**
 * Validates that the buffer starts with PDF header.
 */
function isValidPdf(buffer: Buffer): boolean {
  if (buffer.length < 4) {
    return false;
  }
  // PDF files start with %PDF
  return (
    buffer[0] === 0x25 && // %
    buffer[1] === 0x50 && // P
    buffer[2] === 0x44 && // D
    buffer[3] === 0x46    // F
  );
}

/**
 * Checks if PDF might be password protected.
 * This is a basic heuristic check.
 */
function isPasswordProtected(buffer: Buffer): boolean {
  // Check for encryption dictionary
  const content = buffer.toString('binary', 0, Math.min(buffer.length, 1000));
  return content.includes('/Encrypt') || content.includes('encrypted');
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Estimate the confidence of extracted text based on various factors.
 */
export function estimateTextConfidence(text: string, pageCount: number): number {
  if (!text || pageCount === 0) {
    return 0;
  }

  const textLength = text.trim().length;
  const textPerPage = textLength / pageCount;

  // Base confidence from text density
  let confidence = Math.min(1, textPerPage / 100);

  // Penalty for excessive whitespace
  const whitespaceRatio = (text.match(/\s/g) || []).length / textLength;
  if (whitespaceRatio > 0.8) {
    confidence *= 0.5;
  }

  // Penalty for very short text
  if (textLength < 100) {
    confidence *= 0.3;
  }

  return confidence;
}
