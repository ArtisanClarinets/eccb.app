/**
 * Document Classification Function
 *
 * Classifies extracted OCR text to identify document type and extract metadata.
 * Uses retry logic, timeout handling, and input sanitization.
 */

import { z } from 'zod';

import {
  withRetry,
  withTimeout,
} from '@/lib/ai/structured-output';
import {
  DocumentClassificationSchema,
  type DocumentClassification,
  DOCUMENT_CLASSIFICATION_PROMPT,
} from '@/lib/ai/prompts/document-classification';
import {
  generateStructuredOutput,
  type StructuredExtractionResult,
} from '@/lib/ai/index';

// Configuration constants
const CLASSIFICATION_TIMEOUT_MS = 45000; // 45 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const MAX_INPUT_LENGTH = 8000; // Approximate token limit for context

/**
 * Classifies extracted OCR text to identify document type and extract metadata
 *
 * @param ocrText - The text extracted from OCR processing
 * @param pageCount - Number of pages in the source document (for context)
 * @returns Structured classification result with confidence score
 */
export async function classifyExtractedText(
  ocrText: string,
  pageCount?: number
): Promise<StructuredExtractionResult<DocumentClassification>> {
  // Input validation
  if (!ocrText || typeof ocrText !== 'string') {
    return {
      data: null,
      error: 'Invalid input: OCR text must be a non-empty string',
      rawResponse: null,
    };
  }

  // Sanitize input to prevent prompt injection
  const sanitizedText = sanitizeOcrText(ocrText);

  // Truncate if too long (token optimization)
  const truncatedText = sanitizedText.length > MAX_INPUT_LENGTH
    ? sanitizedText.substring(0, MAX_INPUT_LENGTH) + '\n[TRUNCATED]'
    : sanitizedText;

  // Build the prompt
  const userPrompt = `Analyze the following OCR-extracted text and classify the document:

${truncatedText}${pageCount ? `\n\nDocument has ${pageCount} page(s).` : ''}

Provide a structured classification with all extractable metadata.`;

  try {
    // Execute with timeout and retry
    const result = await withTimeout(
      async () => withRetry(
        async () => generateStructuredOutput<DocumentClassification>(
          userPrompt,
          DocumentClassificationSchema as z.ZodSchema<DocumentClassification>,
          DOCUMENT_CLASSIFICATION_PROMPT
        ),
        MAX_RETRIES,
        RETRY_DELAY_MS
      ),
      CLASSIFICATION_TIMEOUT_MS
    );

    return result;
  } catch (error) {
    // Handle generic error cases
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Check for timeout
    if (errorMessage.includes('timed out')) {
      return {
        data: null,
        error: 'Document classification timed out',
        rawResponse: null,
      };
    }

    // Check for retry exhaustion
    if (errorMessage.includes('retries') || errorMessage.includes('retry')) {
      return {
        data: null,
        error: `Classification failed after ${MAX_RETRIES} retries: ${errorMessage}`,
        rawResponse: null,
      };
    }

    // Generic error handling
    return {
      data: null,
      error: `Classification failed: ${errorMessage}`,
      rawResponse: null,
    };
  }
}

/**
 * Sanitizes OCR text to prevent prompt injection attacks
 */
function sanitizeOcrText(text: string): string {
  return text
    // Remove potential prompt injection patterns
    .replace(/<\s*system\s*>/gi, '[SYSTEM_TAG_REMOVED]')
    .replace(/<\s*user\s*>/gi, '[USER_TAG_REMOVED]')
    .replace(/<\s*assistant\s*>/gi, '[ASSISTANT_TAG_REMOVED]')
    .replace(/```/g, '[CODE_BLOCK_REMOVED]')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Determines if an error is retryable
 */
function _isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Retry on rate limits, timeouts, and transient errors
    return (
      message.includes('rate limit') ||
      message.includes('timeout') ||
      message.includes('429') ||
      message.includes('503') ||
      message.includes('502') ||
      message.includes('network') ||
      message.includes('econnreset')
    );
  }
  return false;
}
