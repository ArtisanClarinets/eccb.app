/**
 * Smart Upload Types
 *
 * Shared types for the Smart Upload feature including PDF processing,
 * text extraction, and validation.
 */

// =============================================================================
// OCR and Text Extraction Types
// =============================================================================

export type OcrMode = 'pdf_text' | 'tesseract' | 'ocrmypdf' | 'vision_api';

export type ExtractionMethod = 'pdf_parse' | 'ocr' | 'hybrid';

export interface PdfExtractionResult {
  text: string;
  pageCount: number;
  method: ExtractionMethod;
  confidence: number;
}

export interface TextExtractionOptions {
  ocrMode?: OcrMode;
  minTextLength?: number;
  minConfidence?: number;
}

// =============================================================================
// PDF Splitting Types
// =============================================================================

export interface SplitPage {
  start: number;
  end: number;
  instrument: string;
}

export interface SplitPlan {
  pages: SplitPage[];
}

export interface SplitFile {
  buffer: Buffer;
  instrument: string;
  pages: number[];
  storageKey: string;
}

export interface SplitResult {
  files: SplitFile[];
}

// =============================================================================
// Part Classification Types (for LLM classification result)
// =============================================================================

export interface PartClassification {
  parts: ClassifiedPart[];
  totalPages: number;
  confidence: number;
}

export interface ClassifiedPart {
  instrument: string;
  pages: number[];
  confidence: number;
}

// =============================================================================
// Validation Types
// =============================================================================

export interface FileValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface FileInfo {
  name: string;
  type: string;
  size: number;
}

// =============================================================================
// Content Hash Types
// =============================================================================

export interface ContentHashResult {
  hash: string;
  algorithm: 'sha256';
}

// =============================================================================
// Smart Upload Configuration
// =============================================================================

export interface SmartUploadConfig {
  enabled: boolean;
  maxFiles: number;
  maxTotalBytes: number;
  ocrMode: OcrMode;
}

// =============================================================================
// Error Types
// =============================================================================

export class SmartUploadError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = 'SmartUploadError';
  }
}

export class PdfExtractionError extends SmartUploadError {
  constructor(message: string, public readonly cause?: unknown) {
    super(message, 'PDF_EXTRACTION_ERROR', 500);
    this.name = 'PdfExtractionError';
  }
}

export class PdfSplitError extends SmartUploadError {
  constructor(message: string, public readonly cause?: unknown) {
    super(message, 'PDF_SPLIT_ERROR', 500);
    this.name = 'PdfSplitError';
  }
}

export class ValidationError extends SmartUploadError {
  constructor(message: string, public readonly errors: string[] = []) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}
