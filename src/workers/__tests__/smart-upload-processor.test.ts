/**
 * Smart Upload Processor Worker — Integration Test
 *
 * Exercises the full processSmartUpload pipeline with a real (minimal) PDF
 * buffer and mocked LLM / storage / DB dependencies.
 *
 * GAP 9 (DoD §11.3)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';

// ---------------------------------------------------------------------------
// Mocks — must be defined before dynamic imports
// ---------------------------------------------------------------------------

// Mock pdf-lib: the processor uses PDFDocument.load() to get page count.
// In Vitest's VM, Buffer fails pdf-lib's cross-realm instanceof Uint8Array check.
vi.mock('pdf-lib', () => ({
  PDFDocument: {
    load: vi.fn().mockResolvedValue({ getPageCount: () => 3 }),
    create: vi.fn().mockResolvedValue({
      addPage: vi.fn(),
      save: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
    }),
  },
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    smartUploadSession: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/services/storage', () => ({
  downloadFile: vi.fn(),
  uploadFile: vi.fn(),
  getSignedDownloadUrl: vi.fn(),
}));

vi.mock('@/lib/llm', () => ({
  callVisionModel: vi.fn(),
}));

vi.mock('@/lib/llm/config-loader', () => ({
  loadSmartUploadRuntimeConfig: vi.fn(),
  runtimeToAdapterConfig: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/services/pdf-renderer', () => ({
  renderPdfPageBatch: vi.fn().mockResolvedValue(['base64page1', 'base64page2', 'base64page3']),
  renderPdfHeaderCropBatch: vi
    .fn()
    .mockResolvedValue(['base64header1', 'base64header2', 'base64header3']),
  clearRenderCache: vi.fn(),
}));

vi.mock('@/lib/services/pdf-text-extractor', () => ({
  extractPdfPageHeaders: vi.fn().mockResolvedValue({
    hasTextLayer: false,
    headers: [],
  }),
}));

vi.mock('@/lib/services/part-boundary-detector', () => ({
  detectPartBoundaries: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib/services/pdf-splitter', () => ({
  splitPdfByCuttingInstructions: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/jobs/smart-upload', () => ({
  queueSmartUploadSecondPass: vi.fn().mockResolvedValue({ id: 'sp-job' }),
  queueSmartUploadAutoCommit: vi.fn().mockResolvedValue({ id: 'ac-job' }),
  SmartUploadJobProgress: {},
  SMART_UPLOAD_JOB_NAMES: {
    PROCESS: 'smartupload.process',
    SECOND_PASS: 'smartupload.secondPass',
    AUTO_COMMIT: 'smartupload.autoCommit',
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
import { prisma } from '@/lib/db';
import { deepCloneJSON } from '@/lib/json';
import { downloadFile, uploadFile } from '@/lib/services/storage';
import { callVisionModel } from '@/lib/llm';
import { loadSmartUploadRuntimeConfig } from '@/lib/llm/config-loader';
import { splitPdfByCuttingInstructions } from '@/lib/services/pdf-splitter';
import {
  queueSmartUploadSecondPass,
} from '@/lib/jobs/smart-upload';

const { processSmartUpload } = await import('@/workers/smart-upload-processor');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fake PDF buffer — pdf-lib is mocked so any bytes work */
const FAKE_PDF = Buffer.from('%PDF-1.4 fake-test-content');

function makeJob(sessionId: string, fileId = 'file-1') {
  return {
    id: 'job-1',
    data: { sessionId, fileId },
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function makeLlmConfig(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'openrouter',
    endpointUrl: 'https://openrouter.ai/api/v1',
    visionModel: 'test-vision-model',
    verificationModel: 'test-verify-model',
    adjudicatorModel: 'test-adj-model',
    openaiApiKey: '',
    anthropicApiKey: '',
    openrouterApiKey: 'test-key',
    geminiApiKey: '',
    ollamaCloudApiKey: '',
    mistralApiKey: '',
    groqApiKey: '',
    customApiKey: '',
    confidenceThreshold: 60,
    twoPassEnabled: true,
    visionSystemPrompt: '',
    verificationSystemPrompt: '',
    headerLabelPrompt: '',
    adjudicatorPrompt: '',
    rateLimit: 10,
    autoApproveThreshold: 95,
    skipParseThreshold: 55,
    maxPages: 200,
    maxFileSizeMb: 100,
    maxConcurrent: 2,
    allowedMimeTypes: ['application/pdf'],
    enableFullyAutonomousMode: false,
    autonomousApprovalThreshold: 90,
    visionModelParams: {},
    verificationModelParams: {},
    promptVersion: '1.0',
    ...overrides,
  };
}

/** Mock LLM response JSON for a high-confidence 3-part extraction. */
const HIGH_CONFIDENCE_RESPONSE = JSON.stringify({
  title: 'American Patrol',
  composer: 'F.W. Meacham',
  arranger: null,
  fileType: 'FULL_SCORE',
  isMultiPart: true,
  confidenceScore: 92,
  parts: [
    { instrument: 'Piccolo / Flute', partName: 'Piccolo / Flute', section: 'Woodwinds', transposition: 'C', partNumber: 1 },
    { instrument: '1st Bb Clarinet', partName: '1st Bb Clarinet', section: 'Woodwinds', transposition: 'Bb', partNumber: 2 },
    { instrument: 'Tuba', partName: 'Tuba', section: 'Brass', transposition: 'C', partNumber: 3 },
  ],
  cuttingInstructions: [
    { partName: 'Piccolo / Flute', instrument: 'Piccolo / Flute', section: 'Woodwinds', transposition: 'C', partNumber: 1, pageRange: [1, 1] },
    { partName: '1st Bb Clarinet', instrument: '1st Bb Clarinet', section: 'Woodwinds', transposition: 'Bb', partNumber: 2, pageRange: [2, 2] },
    { partName: 'Tuba', instrument: 'Tuba', section: 'Brass', transposition: 'C', partNumber: 3, pageRange: [3, 3] },
  ],
});

const LOW_CONFIDENCE_RESPONSE = JSON.stringify({
  title: 'Unknown Piece',
  confidenceScore: 40,
  isMultiPart: true,
  parts: [{ instrument: 'Unknown', partName: 'Part 1' }],
  cuttingInstructions: [
    { partName: 'Part 1', instrument: 'Unknown', pageRange: [1, 3] },
  ],
});

const SESSION_ID = 'test-session-1';

// =============================================================================
// Tests
// =============================================================================

describe('processSmartUpload — integration', () => {

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default mocks
    vi.mocked(prisma.smartUploadSession.findUnique).mockResolvedValue({
      uploadSessionId: SESSION_ID,
      storageKey: `smart-upload/${SESSION_ID}/original.pdf`,
      uploadedBy: 'user-1',
      fileName: 'american-patrol.pdf',
      parseStatus: 'PENDING',
    } as any);

    vi.mocked(prisma.smartUploadSession.update).mockResolvedValue({} as any);

    vi.mocked(downloadFile).mockResolvedValue({
      stream: new Readable({
        read() {
          this.push(FAKE_PDF);
          this.push(null);
        },
      }) as unknown as NodeJS.ReadableStream,
      metadata: { contentType: 'application/pdf', size: FAKE_PDF.length },
    });

    vi.mocked(uploadFile).mockResolvedValue('mock-etag');

    vi.mocked(loadSmartUploadRuntimeConfig).mockResolvedValue(makeLlmConfig() as any);

    // Mock pdf-splitter to return realistic split results
    vi.mocked(splitPdfByCuttingInstructions).mockResolvedValue([
      {
        instruction: {
          partName: 'Piccolo / Flute',
          instrument: 'Piccolo / Flute',
          section: 'Woodwinds',
          transposition: 'C',
          partNumber: 1,
          pageRange: [0, 0] as [number, number],
        },
        buffer: Buffer.from('fake-pdf-1'),
        pageCount: 1,
      },
      {
        instruction: {
          partName: '1st Bb Clarinet',
          instrument: '1st Bb Clarinet',
          section: 'Woodwinds',
          transposition: 'Bb',
          partNumber: 2,
          pageRange: [1, 1] as [number, number],
        },
        buffer: Buffer.from('fake-pdf-2'),
        pageCount: 1,
      },
      {
        instruction: {
          partName: 'Tuba',
          instrument: 'Tuba',
          section: 'Brass',
          transposition: 'C',
          partNumber: 3,
          pageRange: [2, 2] as [number, number],
        },
        buffer: Buffer.from('fake-pdf-3'),
        pageCount: 1,
      },
    ] as any);
  });

  // -----------------------------------------------------------------------
  // High-confidence path
  // -----------------------------------------------------------------------

  it('processes a high-confidence extraction end-to-end', async () => {
    vi.mocked(callVisionModel).mockResolvedValue({ content: HIGH_CONFIDENCE_RESPONSE });

    const job = makeJob(SESSION_ID);
    const result = await processSmartUpload(job);

    // Pipeline completed
    expect(result.status).toBe('complete');
    expect(result.partsCreated).toBe(3);

    // Session was updated with parsed data
    const updateCalls = vi.mocked(prisma.smartUploadSession.update).mock.calls;
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);

    // Find the final update (one with parsedParts)
    const finalUpdate = updateCalls.find(
      (call) => (call[0] as any).data?.parseStatus === 'PARSED'
    );
    expect(finalUpdate).toBeDefined();

    const data = (finalUpdate![0] as any).data;
    expect(data.parseStatus).toBe('PARSED');

    const parsedParts = deepCloneJSON(data.parsedParts) as any[];
    expect(parsedParts).toHaveLength(3);

    // Each split part was uploaded to storage
    expect(uploadFile).toHaveBeenCalledTimes(3);

    // Confidence >= autoApproveThreshold(95) is false at 92, so it's routed to second pass
    expect(data.routingDecision).toBe('auto_parse_second_pass');
  });

  it('uploads parts with scoped storage keys', async () => {
    vi.mocked(callVisionModel).mockResolvedValue({ content: HIGH_CONFIDENCE_RESPONSE });

    const job = makeJob(SESSION_ID);
    await processSmartUpload(job);

    const uploadCalls = vi.mocked(uploadFile).mock.calls;
    for (const call of uploadCalls) {
      const storageKey = call[0] as string;
      expect(storageKey).toMatch(/^smart-upload\//);
      expect(storageKey).toContain(SESSION_ID);
    }
  });

  it('queues second pass when confidence < autoApproveThreshold', async () => {
    vi.mocked(callVisionModel).mockResolvedValue({ content: HIGH_CONFIDENCE_RESPONSE });

    const job = makeJob(SESSION_ID);
    await processSmartUpload(job);

    // 92 >= skipParseThreshold(55) but < autoApproveThreshold(95)
    expect(queueSmartUploadSecondPass).toHaveBeenCalledWith(SESSION_ID);
  });

  // -----------------------------------------------------------------------
  // Low-confidence path
  // -----------------------------------------------------------------------

  it('routes low-confidence extraction to second pass with NOT_PARSED status', async () => {
    vi.mocked(callVisionModel).mockResolvedValue({ content: LOW_CONFIDENCE_RESPONSE });

    const job = makeJob(SESSION_ID);
    // Low confidence (40) < skipParseThreshold(55) → no_parse_second_pass
    // This path updates the session and queues second pass WITHOUT splitting
    await processSmartUpload(job);

    const updateCalls = vi.mocked(prisma.smartUploadSession.update).mock.calls;
    const lowConfUpdate = updateCalls.find(
      (call) => (call[0] as any).data?.routingDecision === 'no_parse_second_pass'
    );
    expect(lowConfUpdate).toBeDefined();
    expect((lowConfUpdate![0] as any).data.parseStatus).toBe('NOT_PARSED');
    expect((lowConfUpdate![0] as any).data.secondPassStatus).toBe('QUEUED');
    expect(queueSmartUploadSecondPass).toHaveBeenCalledWith(SESSION_ID);
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  it('throws when session is not found', async () => {
    vi.mocked(prisma.smartUploadSession.findUnique).mockResolvedValue(null);

    const job = makeJob('nonexistent');
    await expect(processSmartUpload(job)).rejects.toThrow(
      /not found/i
    );
  });

  it('calls clearRenderCache after processing', async () => {
    const { clearRenderCache } = await import('@/lib/services/pdf-renderer');
    vi.mocked(callVisionModel).mockResolvedValue({ content: HIGH_CONFIDENCE_RESPONSE });

    const job = makeJob(SESSION_ID);
    await processSmartUpload(job);

    expect(clearRenderCache).toHaveBeenCalledWith(SESSION_ID);
  });
});
