/**
 * Mock LLM Responses for Smart Upload Tests
 * 
 * This file contains mock data for testing the LLM integration
 * with the vision model (llama3.2-vision) and verification model (qwen2.5:7b).
 */

// =============================================================================
// Types
// =============================================================================

export interface ExtractedMetadata {
  title: string;
  composer?: string;
  publisher?: string;
  instrument?: string;
  partNumber?: string;
  confidenceScore: number;
  fileType?: 'FULL_SCORE' | 'CONDUCTOR_SCORE' | 'PART' | 'CONDENSED_SCORE';
  isMultiPart?: boolean;
  parts?: Array<{
    instrument: string;
    partName: string;
  }>;
}

export interface OllamaResponse {
  message: {
    content: string;
  };
  done: boolean;
}

// =============================================================================
// Valid Metadata - High Confidence (>=80)
// =============================================================================

/**
 * Standard valid metadata with high confidence score
 */
export const VALID_METADATA_HIGH_CONFIDENCE: ExtractedMetadata = {
  title: 'Stars and Stripes Forever',
  composer: 'John Philip Sousa',
  publisher: 'Carl Fischer',
  instrument: 'Concert Band',
  partNumber: 'Full Score',
  confidenceScore: 95,
  fileType: 'FULL_SCORE',
};

/**
 * Valid metadata with multiple parts
 */
export const VALID_METADATA_MULTI_PART: ExtractedMetadata = {
  title: 'Christmas Festival',
  composer: 'John Rutter',
  publisher: 'Oxford University Press',
  instrument: 'Concert Band',
  confidenceScore: 88,
  fileType: 'FULL_SCORE',
  isMultiPart: true,
  parts: [
    { instrument: 'Flute', partName: 'Flute 1' },
    { instrument: 'Flute', partName: 'Flute 2' },
    { instrument: 'Oboe', partName: 'Oboe' },
    { instrument: 'Bb Clarinet', partName: 'Bb Clarinet 1' },
    { instrument: 'Bb Clarinet', partName: 'Bb Clarinet 2' },
    { instrument: 'Bb Clarinet', partName: 'Bb Clarinet 3' },
  ],
};

/**
 * Condensed score metadata
 */
export const VALID_METADATA_CONDENSED_SCORE: ExtractedMetadata = {
  title: 'Highland Cathedral',
  composer: 'Michael Korb',
  arranger: 'Rolf Løvland',
  publisher: 'Hal Leonard',
  instrument: 'Brass Band',
  confidenceScore: 92,
  fileType: 'CONDENSED_SCORE',
};

/**
 * Single part metadata
 */
export const VALID_METADATA_SINGLE_PART: ExtractedMetadata = {
  title: 'Abide With Me',
  composer: 'Traditional',
  instrument: 'Bb Clarinet',
  partNumber: 'Part 1',
  confidenceScore: 85,
  fileType: 'PART',
};

// =============================================================================
// Ambiguous Metadata - Low Confidence (<80)
// =============================================================================

/**
 * Ambiguous composer - text unclear
 */
export const AMBIGUOUS_COMPOSER_METADATA: ExtractedMetadata = {
  title: 'Marche Militaire',
  composer: 'Franz Schubert (?)',
  instrument: 'Concert Band',
  confidenceScore: 65,
  fileType: 'FULL_SCORE',
};

/**
 * Ambiguous instrument - multiple possible interpretations
 */
export const AMBIGUOUS_INSTRUMENT_METADATA: ExtractedMetadata = {
  title: 'Victory',
  composer: 'John Philip Sousa',
  instrument: 'Band (type unclear)',
  confidenceScore: 72,
  fileType: 'FULL_SCORE',
};

/**
 * Both composer and instrument ambiguous
 */
export const AMBIGUOUS_BOTH_METADATA: ExtractedMetadata = {
  title: 'Unknown March',
  composer: 'Unclear',
  instrument: 'Unclear',
  confidenceScore: 25,
  fileType: 'FULL_SCORE',
};

/**
 * Partial metadata - missing key fields
 */
export const PARTIAL_METADATA: ExtractedMetadata = {
  title: 'TBD Piece',
  confidenceScore: 45,
};

// =============================================================================
// Edge Cases
// =============================================================================

/**
 * Medley arrangement - multiple titles
 * Note: The system should handle this by storing all titles
 */
export const MEDLEY_METADATA: ExtractedMetadata = {
  title: 'Christmas Medley: Joy to the World / O Holy Night / Silent Night',
  composer: 'Various',
  publisher: 'Hal Leonard',
  instrument: 'Concert Band',
  confidenceScore: 80,
  fileType: 'FULL_SCORE',
};

/**
 * Multiple separate pieces on one score
 */
export const MULTI_PIECE_METADATA: ExtractedMetadata = {
  title: 'Suite: Movement 1 - Overture / Movement 2 - Air / Movement 3 - Dance',
  composer: 'Traditional',
  instrument: 'Concert Band',
  confidenceScore: 82,
  fileType: 'FULL_SCORE',
};

/**
 * Very low confidence - near complete failure
 */
export const VERY_LOW_CONFIDENCE_METADATA: ExtractedMetadata = {
  title: 'Untitled',
  confidenceScore: 10,
};

// =============================================================================
// Ollama API Response Helpers
// =============================================================================

/**
 * Create a mock Ollama response with JSON metadata
 */
export function createOllamaResponse(metadata: ExtractedMetadata): OllamaResponse {
  return {
    message: {
      content: JSON.stringify(metadata),
    },
    done: true,
  };
}

/**
 * Create an Ollama response with JSON wrapped in markdown code blocks
 */
export function createOllamaResponseWithMarkdown(metadata: ExtractedMetadata): OllamaResponse {
  return {
    message: {
      content: `\`\`\`json\n${JSON.stringify(metadata, null, 2)}\n\`\`\``,
    },
    done: true,
  };
}

/**
 * Create a verification response with corrections
 */
export function createVerificationResponse(
  original: ExtractedMetadata,
  corrections: string | null
): OllamaResponse {
  return {
    message: {
      content: JSON.stringify({
        ...original,
        corrections,
      }),
    },
    done: true,
  };
}

// =============================================================================
// Test Data - Complete Scenarios
// =============================================================================

/**
 * Complete test scenarios for different upload cases
 */
export const TEST_SCENARIOS = {
  standardFullScore: {
    metadata: VALID_METADATA_HIGH_CONFIDENCE,
    expectedStatus: 'PENDING_REVIEW',
    expectedConfidence: 95,
  },
  multiPart: {
    metadata: VALID_METADATA_MULTI_PART,
    expectedStatus: 'PENDING_REVIEW',
    expectedConfidence: 88,
    expectedPartCount: 6,
  },
  condensedScore: {
    metadata: VALID_METADATA_CONDENSED_SCORE,
    expectedStatus: 'PENDING_REVIEW',
    expectedFileType: 'CONDENSED_SCORE',
  },
  singlePart: {
    metadata: VALID_METADATA_SINGLE_PART,
    expectedStatus: 'PENDING_REVIEW',
    expectedFileType: 'PART',
  },
  ambiguousComposer: {
    metadata: AMBIGUOUS_COMPOSER_METADATA,
    expectedStatus: 'PENDING_REVIEW',
    expectedConfidenceBelowThreshold: true,
  },
  ambiguousInstrument: {
    metadata: AMBIGUOUS_INSTRUMENT_METADATA,
    expectedStatus: 'PENDING_REVIEW',
    expectedConfidenceBelowThreshold: true,
  },
  veryLowConfidence: {
    metadata: VERY_LOW_CONFIDENCE_METADATA,
    expectedStatus: 'PENDING_REVIEW',
    expectedConfidenceBelowThreshold: true,
  },
} as const;

// =============================================================================
// Mock File Data
// =============================================================================

/**
 * Valid PDF magic bytes (%PDF)
 */
export const VALID_PDF_BUFFER = Buffer.from('%PDF-1.4\n%\u0000\u0000\u0000');

/**
 * Invalid file magic bytes (not a PDF)
 */
export const INVALID_FILE_BUFFER = Buffer.from('GIF89a\x01\x00\x01\x00');

/**
 * Create a mock PDF file buffer with specified size
 */
export function createMockPdfBuffer(size: number = 1024): Buffer {
  const buffer = Buffer.alloc(size);
  // Write PDF magic bytes at the start
  buffer.write('%PDF-1.4\n', 0, 'ascii');
  // Write some dummy content
  buffer.write('test content', 10);
  return buffer;
}

/**
 * Create FormData with a mock file
 */
export function createMockFormData(
  fileName: string = 'test.pdf',
  fileSize: number = 1024,
  mimeType: string = 'application/pdf'
): FormData {
  const blob = new Blob(['test content'], { type: mimeType });
  const file = new File([blob], fileName, { type: mimeType });
  
  const formData = new FormData();
  formData.append('file', file);
  
  return formData;
}

// =============================================================================
// Mock Session Data
// =============================================================================

/**
 * Create a mock authenticated session
 */
export function createMockSession(userId: string = 'user-1'): any {
  return {
    user: {
      id: userId,
      email: 'test@example.com',
      name: 'Test User',
      createdAt: new Date(),
      updatedAt: new Date(),
      emailVerified: true,
      image: null,
      twoFactorEnabled: false,
      banned: false,
      banReason: null,
      banExpires: null,
      role: null,
    },
    session: {
      id: 'session-1',
      userId: userId,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      updatedAt: new Date(),
      token: 'test-token',
      ipAddress: null,
      userAgent: null,
    },
  };
}

/**
 * Create a mock SmartUploadSession from database
 */
export function createMockSmartUploadSession(overrides: Partial<any> = {}): any {
  return {
    id: 'session-id-1',
    uploadSessionId: 'upload-session-uuid-1',
    fileName: 'test.pdf',
    fileSize: 1024,
    mimeType: 'application/pdf',
    storageKey: 'smart-upload/upload-session-uuid-1/original.pdf',
    extractedMetadata: VALID_METADATA_HIGH_CONFIDENCE,
    confidenceScore: 95,
    status: 'PENDING_REVIEW',
    uploadedBy: 'user-1',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
