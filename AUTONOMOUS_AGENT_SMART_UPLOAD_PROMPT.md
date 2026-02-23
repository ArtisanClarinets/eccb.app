# EXHAUSTIVE PROMPT FOR AUTONOMOUS AGENT: Smart Music Upload System - Complete Implementation & Fixes

**Instruction Level:** GRANULAR, EXHAUSTIVE  
**Autonomy Level:** FULL - Agent should resolve all ambiguities and make reasonable decisions  
**Testing Level:** COMPREHENSIVE - Verify each component before moving to next  

---

## EXECUTIVE SUMMARY

The smart music upload feature is **BROKEN** and non-functional. Users can upload PDFs but:
1. PDF is not rendered to an image
2. LLM receives a placeholder image with no content
3. Metadata extraction fails entirely (confidenceScore: 10)
4. Sessions exist in database but don't appear in review UI
5. Even if they did appear, there's no way to preview the PDF or see what the LLM analyzed

**Your Task:** Restore the complete smart upload workflow to full functionality with these components:
- ✓ Real PDF→Image rendering (not placeholder)
- ✓ Working LLM metadata extraction with fallback OCR
- ✓ Visible sessions in review UI with PDF preview
- ✓ Multi-part score detection and splitting
- ✓ End-to-end workflow that actually improves on manual upload

---

## PART 1: DEPENDENCY INSTALLATION & SETUP

### 1.1 Install Missing Packages

**Current State:** The following critical packages are NOT installed but required for PDF processing:

```json
{
  "pdfjs-dist": "^3.11.174",      // PDF rendering engine
  "sharp": "^0.33.0",              // Image processing & format conversion
  "pdf-lib": "^1.17.1",            // PDF splitting and manipulation
  "canvas": "^2.11.2"              // Canvas rendering (required for pdfjs server-side)
}
```

**Action Required:**
1. Run: `npm install pdfjs-dist sharp canvas pdf-lib @types/sharp`
2. Verify installation: `npm list pdfjs-dist sharp canvas pdf-lib`
3. Create `.env` entry if needed for canvas build tools
4. Update `package.json` lock file and commit

**Verification Steps:**
```bash
npm list pdfjs-dist sharp canvas pdf-lib
# Should show all 4 packages installed, no errors
```

---

### 1.2 Initialize System Settings for LLM Configuration

**Current Problem:** System settings for LLM may not be initialized, causing reliance on ENV vars which might not be set.

**File to Modify:** `prisma/seed.ts`

**Action Required:**

Search for existing smart upload settings initialization. If not found, add this block to the seed function:

```typescript
// Initialize Smart Upload LLM Settings
const smartUploadSettings = [
  { key: 'llm_provider', value: process.env.LLM_PROVIDER || 'ollama' },
  { key: 'llm_ollama_endpoint', value: process.env.LLM_OLLAMA_ENDPOINT || 'http://localhost:11434' },
  { key: 'llm_openai_api_key', value: process.env.LLM_OPENAI_API_KEY || '' },
  { key: 'llm_anthropic_api_key', value: process.env.LLM_ANTHROPIC_API_KEY || '' },
  { key: 'llm_openrouter_api_key', value: process.env.LLM_OPENROUTER_API_KEY || '' },
  { key: 'llm_custom_base_url', value: process.env.LLM_CUSTOM_BASE_URL || '' },
  { key: 'llm_custom_api_key', value: process.env.LLM_CUSTOM_API_KEY || '' },
  { key: 'llm_vision_model', value: process.env.LLM_VISION_MODEL || 'llama3.2-vision' },
  { key: 'llm_verification_model', value: process.env.LLM_VERIFICATION_MODEL || 'qwen2.5:7b' },
  { key: 'llm_confidence_threshold', value: '85' },        // Extraction must be 85%+ confident
  { key: 'llm_two_pass_enabled', value: 'true' },          // Enable verification pass
  { key: 'llm_enable_ocr_fallback', value: 'true' },       // OCR fallback for image PDFs
  { key: 'llm_vision_system_prompt', value: '' },          // Empty = use default
  { key: 'llm_verification_system_prompt', value: '' },    // Empty = use default
];

for (const setting of smartUploadSettings) {
  await prisma.systemSetting.upsert({
    where: { key: setting.key },
    update: { value: setting.value },
    create: { key: setting.key, value: setting.value },
  });
}
```

**After edits:**
1. Run: `npm run db:seed`
2. Verify in database: `prisma studio` → check SystemSetting table
3. Should see all 14 smart upload settings created

---

## PART 2: IMPLEMENT PDF RENDERING SERVICE

### 2.1 Create PDF Rendering Service

**File to Create:** `src/lib/services/pdf-renderer.ts`

**Purpose:** Convert PDF first page to image suitable for LLM analysis. This replaces the placeholder image generator.

**Implementation Requirements:**

1. **Function signature:**
```typescript
export async function renderPdfToImage(
  pdfBuffer: Buffer,
  options?: {
    pageIndex?: number;           // Which page to render (default 0)
    quality?: number;              // Output quality 1-100 (default 85)
    maxWidth?: number;              // Max width in pixels (default 1920)
    format?: 'png' | 'jpeg';       // Output format (default PNG)
  }
): Promise<string>  // Returns base64-encoded image
```

2. **Detailed Implementation Steps:**

```typescript
import * as pdfjsLib from 'pdfjs-dist';
import { createCanvas } from 'canvas';
import sharp from 'sharp';
import { logger } from '@/lib/logger';

// Set up PDF.js worker (required for server-side rendering)
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface RenderOptions {
  pageIndex?: number;
  quality?: number;
  maxWidth?: number;
  format?: 'png' | 'jpeg';
}

export async function renderPdfToImage(
  pdfBuffer: Buffer,
  options: RenderOptions = {}
): Promise<string> {
  const {
    pageIndex = 0,
    quality = 85,
    maxWidth = 1920,
    format = 'png',
  } = options;

  try {
    logger.info('Starting PDF render to image', {
      bufferSize: pdfBuffer.length,
      pageIndex,
      quality,
    });

    // Load PDF document
    const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;

    // Validate page exists
    if (pageIndex >= pdf.numPages) {
      logger.warn('Requested page index exceeds PDF pages', {
        requested: pageIndex,
        total: pdf.numPages,
      });
      throw new Error(`Page ${pageIndex} not found in PDF (${pdf.numPages} pages)`);
    }

    // Get the page
    const page = await pdf.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 2 }); // 2x for better quality

    // Create canvas with PDF dimensions
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');

    // Render page to canvas
    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    logger.info('PDF page rendered to canvas', {
      width: viewport.width,
      height: viewport.height,
    });

    // Convert canvas to PNG buffer
    const pngBuffer = canvas.toBuffer('image/png');

    // Optionally resize if too large
    let imageBuffer = pngBuffer;
    if (viewport.width > maxWidth) {
      imageBuffer = await sharp(pngBuffer)
        .resize(maxWidth, Math.round((maxWidth / viewport.width) * viewport.height), {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255 },
        })
        .png()
        .toBuffer();

      logger.info('Image resized', { newWidth: maxWidth });
    }

    // Convert to requested format if not PNG
    if (format === 'jpeg') {
      imageBuffer = await sharp(imageBuffer)
        .jpeg({ quality, progressive: true })
        .toBuffer();
    }

    // Convert to base64
    const base64 = imageBuffer.toString('base64');
    
    logger.info('PDF rendered to base64 image', {
      bufferSize: imageBuffer.length,
      base64Length: base64.length,
      format,
    });

    return base64;
  } catch (error) {
    logger.error('Failed to render PDF to image', { error });
    throw error;
  }
}
```

3. **Error Handling:**
   - If PDF is corrupted → throw error with descriptive message
   - If page doesn't exist → try falling back to page 0
   - If rendering fails → return empty PNG with error logged (don't crash)

4. **Testing:**
   - Create test with valid PDF → verify image is rendered (not placeholder)
   - Verify image is non-tiny (>10KB typically)
   - Verify base64 string is valid
   - Test with multi-page PDF → verify only first page rendered
   - Test with corrupted PDF → verify graceful error handling

---

### 2.2 Create OCR Fallback Service (for image-based PDFs)

**File to Create:** `src/lib/services/ocr-fallback.ts`

**Purpose:** When PDF is image-based (scanned sheet music), use OCR to extract text that can't be rendered as searchable PDF.

**Important Note:** True OCR for sheet music is complex and out of scope. This fallback should:
1. Detect if PDF is image-based (not text-embedded)
2. Log that sheet music needs manual review
3. Provide placeholder metadata with confidence: 25 (review required)

**Implementation:**

```typescript
import { logger } from '@/lib/logger';

interface OCRMetadata {
  title: string;
  composer?: string;
  confidence: number;
  isImageScanned: boolean;
  needsManualReview: boolean;
}

/**
 * Check if PDF appears to be scanned/image-based (not searchable text)
 */
export async function isImageBasedPdf(pdfBuffer: Buffer | string): Promise<boolean> {
  // For now: If we can't extract text from first page, assume image-based
  // In production: Use embedded text extraction before rendering
  // This is a simplified check
  return false; // Placeholder - full implementation would use pdfjs text extraction
}

/**
 * Generate fallback metadata when standard extraction fails (confidence guidance only)
 */
export function generateOCRFallback(filename: string): OCRMetadata {
  // Extract hints from filename
  const title = filename.replace(/\.pdf$/i, '').trim();
  
  return {
    title,
    confidence: 25, // Very low - needs manual review
    isImageScanned: true,
    needsManualReview: true,
  };
}
```

**Note:** Advanced OCR (actually reading sheet music images) would require:
- Tesseract.js (for text OCR) - complex for sheet music
- Music OCR (specialized, expensive)
- Manual entry by admin

For MVP, the fallback is: flag as "needs manual review", provide filename as title.

---

## PART 3: FIX SMART UPLOAD ROUTE HANDLER

### 3.1 Update PDF Processing in Smart Upload Route

**File to Modify:** `src/app/api/files/smart-upload/route.ts`

**Current Issue:** Lines 434-451 return placeholder image instead of rendering PDF

**Changes Required:**

1. **Import the new PDF renderer service** (at top of file):
```typescript
import { renderPdfToImage } from '@/lib/services/pdf-renderer';
import { generateOCRFallback } from '@/lib/services/ocr-fallback';
```

2. **Replace `convertPdfToImage()` function** entirely with new implementation:

```typescript
/**
 * Convert PDF to image for LLM analysis.
 * Renders first page of PDF to base64-encoded PNG image.
 * Falls back to OCR metadata if PDF is image-based.
 */
async function convertPdfToImage(
  pdfBuffer: Buffer,
  llmConfig: LLMConfig
): Promise<{ image: string; isScanned: boolean }> {
  try {
    // Try to render PDF to image
    const image = await renderPdfToImage(pdfBuffer, {
      pageIndex: 0,
      quality: 85,
      maxWidth: 1920,
      format: 'png',
    });

    logger.info('PDF successfully rendered to image', {
      imageSize: image.length,
    });

    return { image, isScanned: false };
  } catch (error) {
    logger.warn('PDF rendering failed, will use fallback extraction', { error });
    
    // Fallback: Return placeholder with flag so LLM knows this is uncertain
    // This allows LLM to provide best-effort extraction
    return { image: generatePlaceholderImage(), isScanned: true };
  }
}

/**
 * Generate a placeholder image when PDF rendering fails.
 * This image will be recognized by LLM as requiring special handling.
 */
function generatePlaceholderImage(): string {
  // Return a light gray solid image (different from before)
  // This signals to fallback logic that PDF couldn't be rendered
  // Actual 100x100 solid gray PNG in base64
  return 'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAADUlEQVR42u3BMQEAAADCoPVPbQhfoAAAAOA1v9QJZX6z/sIAAAAASUVORK5CYII=';
}
```

3. **Update the vision LLM call** to handle the isScanned flag:

Find the section where `callVisionLLM()` is called and wrap it with better error handling:

```typescript
// First pass: Vision model extraction
let extractedMetadata: ExtractedMetadata;
let renderingFailed = false;

try {
  const { image, isScanned } = await convertPdfToImage(buffer, llmConfig);
  renderingFailed = isScanned;

  // If rendering failed, try to provide some metadata via LLM
  // The LLM can still try to extract from filename or default metadata
  const systemPromptAdjusted = isScanned
    ? DEFAULT_VISION_SYSTEM_PROMPT + 
      "\n\nNOTE: This PDF could not be rendered to image. " +
      "Use metadata from filename or return minimal metadata. " +
      "If you cannot extract anything, return: { title: extracted from filename, confidenceScore: 20 }"
    : DEFAULT_VISION_SYSTEM_PROMPT;

  extractedMetadata = await callVisionLLM(image, {
    ...llmConfig,
    visionSystemPrompt: systemPromptAdjusted,
  });

  logger.info('Vision model extraction complete', {
    sessionId,
    confidence: extractedMetadata.confidenceScore,
    provider: llmConfig.provider,
    model: llmConfig.visionModel,
    renderingFailed,
  });
} catch (error) {
  logger.error('Vision model extraction failed', { error, sessionId });
  
  // Create fallback metadata - better than before
  const ocr = generateOCRFallback(file.name);
  extractedMetadata = {
    title: ocr.title,
    confidenceScore: 20, // Higher than before (10)
  };
}
```

4. **Improve verification pass logic:**

Find the verification pass section and update confidence threshold checks:

```typescript
// Second pass: Verification model (for low-confidence extractions)
// But only if confidence is reasonable to begin with (not too low)
if (
  llmConfig.twoPassEnabled &&
  extractedMetadata.confidenceScore >= 30 &&  // Don't verify garbage metadata
  extractedMetadata.confidenceScore < llmConfig.confidenceThreshold
) {
  try {
    const verified = await verifyMetadata(imageBase64, extractedMetadata, llmConfig);
    extractedMetadata = verified;
    logger.info('Verification model complete', {
      sessionId,
      confidence: extractedMetadata.confidenceScore,
      model: llmConfig.verificationModel,
    });
  } catch (error) {
    logger.warn('Verification model failed, using original', { error, sessionId });
  }
} else if (extractedMetadata.confidenceScore < 30) {
  logger.warn('Metadata confidence too low to verify', {
    sessionId,
    score: extractedMetadata.confidenceScore,
  });
}
```

---

## PART 4: FIX REVIEW UI SESSION VISIBILITY

### 4.1 Debug Why Sessions Don't Appear

**File to Inspect:** `src/app/(admin)/admin/uploads/review/page.tsx`

**Current Problem:** Session exists in DB with PENDING_REVIEW status but doesn't show in UI

**Investigation Steps:**

1. **Check permission verification** - Verify `music:read` permission:
   - Add detailed logging to `GET /api/admin/uploads/review`
   - Log which user is fetching and their permissions
   - Return permission error if not authorized

2. **Check API response transformation** - Verify ID field mapping:
   - Endpoint returns ID as `uploadSessionId` 
   - Client expects ID as `id`
   - Check that transformation is happening correctly

3. **Add logging to client-side fetch** - Debug what's returned:

Modify the `fetchSessions` function in the review page:

```typescript
const fetchSessions = async () => {
  setLoading(true);
  try {
    console.log('[REVIEW] Fetching sessions...'); // Debug log
    const response = await fetch('/api/admin/uploads/review?status=PENDING_REVIEW');
    
    console.log('[REVIEW] Response status:', response.status); // Debug
    
    const data = await response.json();
    
    console.log('[REVIEW] Response data:', data); // Debug
    console.log('[REVIEW] Sessions count:', data.sessions?.length); // Debug
    console.log('[REVIEW] Raw sessions:', JSON.stringify(data.sessions, null, 2)); // Full debug
    
    if (data.sessions) {
      console.log('[REVIEW] Setting sessions, count:', data.sessions.length);
      setSessions(data.sessions);
      setStats(data.stats);
    } else if (data.error) {
      console.error('[REVIEW] API returned error:', data.error);
    }
  } catch (error) {
    console.error('[REVIEW] Fetch failed:', error); // Debug
  } finally {
    setLoading(false);
  }
};
```

4. **Check if permission is the issue** - Add this debug to approval route:

```typescript
// In /api/admin/uploads/review route.ts - before permission check
logger.info('Review endpoint accessed', {
  userId: session?.user?.id,
  hasSession: !!session,
  userEmail: session?.user?.email,
});

// After permission check
logger.info('Permission check result', {
  userId: session.user.id,
  hasPermission,
  requiredPermission: 'music:read',
});

if (!hasPermission) {
  logger.warn('Permission denied for review access', {
    userId: session.user.id,
  });
}
```

5. **Run the app and test:**
   - Open review page
   - Check browser console for debug logs
   - Check server logs for endpoint access logs
   - Identify where the issue is (permission, transformation, empty query, etc.)

---

### 4.2 Fix Initial Data Loading

**Current Issue:** Server component initializes with empty data, client fetches, but there's a flash of empty state

**File:** `src/app/(admin)/admin/uploads/review/page.tsx`

**Improvements to make:**

1. **Pre-fetch data on server:**

```typescript
// Server component part (at bottom of file)
export default async function UploadReviewPage() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return <div>Unauthorized</div>;
    }

    // Check permission
    const hasPermission = await checkUserPermission(session.user.id, 'music:read');
    if (!hasPermission) {
      return <div>Forbidden</div>;
    }

    // Fetch initial data on server
    const sessions = await prisma.smartUploadSession.findMany({
      where: { status: 'PENDING_REVIEW' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const [pending, approved, rejected] = await Promise.all([
      prisma.smartUploadSession.count({ where: { status: 'PENDING_REVIEW' } }),
      prisma.smartUploadSession.count({ where: { status: 'APPROVED' } }),
      prisma.smartUploadSession.count({ where: { status: 'REJECTED' } }),
    ]);

    // Transform to match client interface
    const transformedSessions = sessions.map((s) => ({
      id: s.uploadSessionId,  // Important: map uploadSessionId to id
      fileName: s.fileName,
      fileSize: s.fileSize,
      mimeType: s.mimeType,
      storageKey: s.storageKey,
      confidenceScore: s.confidenceScore,
      status: s.status,
      uploadedBy: s.uploadedBy,
      reviewedBy: s.reviewedBy,
      reviewedAt: s.reviewedAt,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      extractedMetadata: s.extractedMetadata as ExtractedMetadata | null,
    }));

    return (
      <UploadReviewClient
        initialSessions={transformedSessions}
        initialStats={{ pending, approved, rejected }}
      />
    );
  } catch (error) {
    logger.error('Failed to load review page', { error });
    return (
      <div className="text-center py-12">
        <p className="text-red-500">Failed to load review page</p>
      </div>
    );
  }
}
```

---

## PART 5: ADD PDF PREVIEW TO REVIEW UI

### 5.1 Create PDF Preview Component

**File to Create:** `src/components/admin/music/upload-preview-dialog.tsx`

**Purpose:** Show user the actual PDF rendered image alongside extracted metadata so they can validate extraction accuracy

**Implementation:**

```typescript
'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Image from 'next/image';

interface ExtractedMetadata {
  title: string;
  composer?: string;
  publisher?: string;
  instrument?: string;
  confidenceScore: number;
  fileType?: string;
  isMultiPart?: boolean;
  parts?: Array<{ instrument: string; partName: string }>;
}

interface UploadPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  renderedImage?: string | null; // Base64 image from server
  extractedMetadata?: ExtractedMetadata | null;
}

export function UploadPreviewDialog({
  open,
  onOpenChange,
  fileName,
  renderedImage,
  extractedMetadata,
}: UploadPreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Preview: {fileName}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          {/* Left: PDF Image */}
          <div>
            <h3 className="text-sm font-semibold mb-2">PDF Preview</h3>
            {renderedImage ? (
              <img
                src={`data:image/png;base64,${renderedImage}`}
                alt="PDF preview"
                className="w-full border rounded-lg bg-gray-50"
              />
            ) : (
              <div className="w-full h-96 bg-gray-100 rounded-lg flex items-center justify-center border">
                <p className="text-gray-500">No preview available</p>
              </div>
            )}
          </div>

          {/* Right: Extracted Metadata */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Extracted Metadata</h3>
            {extractedMetadata ? (
              <Card>
                <CardContent className="pt-4 space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500">Title</label>
                    <p className="text-sm font-medium">{extractedMetadata.title}</p>
                  </div>
                  {extractedMetadata.composer && (
                    <div>
                      <label className="text-xs font-semibold text-gray-500">Composer</label>
                      <p className="text-sm">{extractedMetadata.composer}</p>
                    </div>
                  )}
                  {extractedMetadata.publisher && (
                    <div>
                      <label className="text-xs font-semibold text-gray-500">Publisher</label>
                      <p className="text-sm">{extractedMetadata.publisher}</p>
                    </div>
                  )}
                  {extractedMetadata.instrument && (
                    <div>
                      <label className="text-xs font-semibold text-gray-500">Instrument</label>
                      <p className="text-sm">{extractedMetadata.instrument}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-semibold text-gray-500">Confidence</label>
                    <Badge className={
                      extractedMetadata.confidenceScore >= 85 ? 'bg-green-100 text-green-800' :
                      extractedMetadata.confidenceScore >= 70 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }>
                      {extractedMetadata.confidenceScore}%
                    </Badge>
                  </div>
                  {extractedMetadata.fileType && (
                    <div>
                      <label className="text-xs font-semibold text-gray-500">File Type</label>
                      <p className="text-sm">{extractedMetadata.fileType}</p>
                    </div>
                  )}
                  {extractedMetadata.isMultiPart && extractedMetadata.parts?.length ? (
                    <div>
                      <label className="text-xs font-semibold text-gray-500">Parts</label>
                      <ul className="text-sm space-y-1">
                        {extractedMetadata.parts.map((part, i) => (
                          <li key={i}>• {part.instrument}: {part.partName}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : (
              <div className="h-96 bg-gray-100 rounded-lg flex items-center justify-center">
                <p className="text-gray-500">No metadata available</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

### 5.2 Integrate Preview into Review Table

**File to Modify:** `src/app/(admin)/admin/uploads/review/page.tsx`

**Changes:**

1. Import the new dialog
2. Add state for preview dialog
3. Add "Preview" button to each session row

```typescript
import { UploadPreviewDialog } from '@/components/admin/music/upload-preview-dialog';

// Inside UploadReviewClient function, add to state:
const [previewOpen, setPreviewOpen] = useState(false);
const [previewSession, setPreviewSession] = useState<SmartUploadSession | null>(null);

// Add function to handle preview
const handlePreview = (session: SmartUploadSession) => {
  setPreviewSession(session);
  setPreviewOpen(true);
};

// In the actions column of the table, add:
<Button
  variant="outline"
  size="sm"
  onClick={() => handlePreview(session)}
>
  <Eye className="h-4 w-4 mr-1" />
  Preview
</Button>

// Add the dialog component before the closing div:
{previewSession && (
  <UploadPreviewDialog
    open={previewOpen}
    onOpenChange={setPreviewOpen}
    fileName={previewSession.fileName}
    extractedMetadata={previewSession.extractedMetadata}
    // Note: rendered image is NOT stored in SmartUploadSession
    // This is okay - we can fetch it on-demand if needed
    renderedImage={null}
  />
)}
```

---

## PART 6: IMPLEMENT MULTI-PART SCORE DETECTION & SPLITTING

### 6.1 Create PDF Part Detection Service

**File to Create:** `src/lib/services/pdf-part-detector.ts`

**Purpose:** Analyze extracted metadata and PDF structure to identify if it's a multi-part score and which parts need to be split

```typescript
import { logger } from '@/lib/logger';
import * as pdfjsLib from 'pdfjs-dist';

interface PartInfo {
  pageRange: [number, number];    // [startPage, endPage]
  instrumentName: string;
  partName: string;
  estimatedPartNumber: number;
}

export interface SmartUploadPartAnalysis {
  isMultiPart: boolean;
  totalPages: number;
  estimatedParts: PartInfo[];
  confidence: number;
  notes: string;
}

/**
 * Analyze PDF to detect multi-part structure
 * Returns information about which pages belong to which parts
 */
export async function analyzePdfParts(
  pdfBuffer: Buffer,
  extractedMetadata: any  // from LLM extraction
): Promise<SmartUploadPartAnalysis> {
  try {
    // Load PDF
    const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
    const totalPages = pdf.numPages;

    logger.info('Analyzing PDF for multi-part structure', {
      totalPages,
      hasMetadataParts: !!extractedMetadata.parts,
    });

    // SIMPLIFIED: If metadata says it's multi-part, trust that
    // COMPLEX: Would need to analyze page headers for "Part 1", etc.
    if (extractedMetadata.isMultiPart && Array.isArray(extractedMetadata.parts)) {
      // Estimate equal page distribution among parts
      const partsCount = extractedMetadata.parts.length;
      const pagesPerPart = Math.ceil(totalPages / partsCount);

      const parts = extractedMetadata.parts.map((part: any, index: number) => ({
        pageRange: [
          index * pagesPerPart,
          Math.min((index + 1) * pagesPerPart - 1, totalPages - 1),
        ] as [number, number],
        instrumentName: part.instrument || 'Unknown',
        partName: part.partName || `Part ${index + 1}`,
        estimatedPartNumber: index + 1,
      }));

      return {
        isMultiPart: true,
        totalPages,
        estimatedParts: parts,
        confidence: 60, // Moderate confidence without page header analysis
        notes: 'Multi-part structure detected from LLM metadata. Page boundaries are estimates.',
      };
    }

    return {
      isMultiPart: false,
      totalPages,
      estimatedParts: [],
      confidence: 85,
      notes: 'Single-part score detected.',
    };
  } catch (error) {
    logger.error('Failed to analyze PDF parts', { error });
    return {
      isMultiPart: false,
      totalPages: 0,
      estimatedParts: [],
      confidence: 0,
      notes: 'Error analyzing PDF: ' + (error instanceof Error ? error.message : 'unknown'),
    };
  }
}
```

---

### 6.2 Create PDF Splitting Service

**File to Create:** `src/lib/services/pdf-splitter.ts`

**Purpose:** Split a multi-part PDF into individual part PDFs

```typescript
import { PDFDocument } from 'pdf-lib';
import { logger } from '@/lib/logger';

/**
 * Split PDF into separate files by page ranges
 */
export async function splitPdfByPageRanges(
  pdfBuffer: Buffer,
  pageRanges: Array<{ start: number; end: number; name: string }>
): Promise<{ name: string; buffer: Buffer }[]> {
  if (pageRanges.length === 0) {
    return [{ name: 'unsplit.pdf', buffer: pdfBuffer }];
  }

  try {
    const sourcePdf = await PDFDocument.load(pdfBuffer);
    const results: { name: string; buffer: Buffer }[] = [];

    for (const range of pageRanges) {
      const newPdf = await PDFDocument.create();
      const pageIndices = [];

      for (let i = range.start; i <= range.end; i++) {
        if (i < sourcePdf.getPageCount()) {
          pageIndices.push(i);
        }
      }

      if (pageIndices.length === 0) {
        logger.warn('No valid pages for part', { range });
        continue;
      }

      // Copy pages to new PDF
      const copiedPages = await newPdf.copyPages(sourcePdf, pageIndices);
      copiedPages.forEach((page) => newPdf.addPage(page));

      // Save to buffer
      const pdfBytes = await newPdf.save();
      const buffer = Buffer.from(pdfBytes);

      results.push({
        name: range.name,
        buffer,
      });

      logger.info('Split part created', { partName: range.name, pages: pageIndices.length });
    }

    return results;
  } catch (error) {
    logger.error('Failed to split PDF', { error });
    throw error;
  }
}
```

---

## PART 7: IMPROVE APPROVAL LOGIC FOR MULTI-PART SCORES

### 7.1 Update Approve Route to Handle Parts

**File to Modify:** `src/app/api/admin/uploads/review/[id]/approve/route.ts`

**Current State:** Creates single MusicFile from upload

**Required Changes:**

```typescript
// In the approval logic, after creating MusicFile, add:

// If multi-part score, split PDF and create files for each part
if (extractedMetadata?.isMultiPart && extractedMetadata.parts?.length) {
  try {
    // Analyze PDF structure
    const analysis = await analyzePdfParts(uploadSession.storageKey, extractedMetadata);
    
    if (analysis.isMultiPart && analysis.estimatedParts.length > 0) {
      // Download original PDF
      const pdfBuffer = await downloadFile(uploadSession.storageKey);
      
      // Split into parts
      const pageRanges = analysis.estimatedParts.map((part) => ({
        start: part.pageRange[0],
        end: part.pageRange[1],
        name: `${musicPiece.title} - Part ${part.estimatedPartNumber} - ${part.instrumentName}.pdf`,
      }));
      
      const splitParts = await splitPdfByPageRanges(
        Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer as string),
        pageRanges
      );
      
      // Create MusicFile for each part
      for (const part of splitParts) {
        const storageKeyPart = `music-library/${musicPiece.id}/parts/${part.name}`;
        
        // Upload part PDF
        await uploadFile(storageKeyPart, part.buffer, {
          contentType: 'application/pdf',
          metadata: {
            mainPieceId: musicPiece.id,
            partName: part.name,
          },
        });
        
        // Create MusicFile record for part
        await tx.musicFile.create({
          data: {
            pieceId: musicPiece.id,
            fileName: part.name,
            fileType: 'PART',
            fileSize: part.buffer.length,
            mimeType: 'application/pdf',
            storageKey: storageKeyPart,
            uploadedBy: session.user.id,
            source: 'SMART_UPLOAD_SPLIT',
          },
        });
      }
      
      logger.info('PDF split into parts', {
        pieceId: musicPiece.id,
        partsCount: splitParts.length,
      });
    }
  } catch (error) {
    logger.warn('PDF splitting failed, using original unsplit file', { error });
    // Continue with unsplit file
  }
}
```

---

## PART 8: TESTING & VERIFICATION

### 8.1 Create Test Cases

**File to Create:** `src/app/api/files/smart-upload/__tests__/pdf-rendering.test.ts`

**Test Suite:**

```typescript
import { describe, it, expect } from 'vitest';
import { renderPdfToImage } from '@/lib/services/pdf-renderer';
import fs from 'fs';
import path from 'path';

describe('PDF Rendering', () => {
  it('should render valid PDF to base64 image', async () => {
    // Load sample PDF (must exist in test fixtures)
    const pdfPath = path.join(__dirname, '../__fixtures__/sample.pdf');
    const pdfBuffer = fs.readFileSync(pdfPath);

    const base64 = await renderPdfToImage(pdfBuffer);

    // Verify it's not the placeholder
    expect(base64.length).toBeGreaterThan(5000); // Real image should be larger
    expect(base64).toMatch(/^iVBORw0KGgo/); // PNG magic bytes in base64
  });

  it('should throw error for corrupted PDF', async () => {
    const corruptedPdf = Buffer.from('Not a real PDF');

    await expect(renderPdfToImage(corruptedPdf)).rejects.toThrow();
  });

  it('should handle multi-page PDF (render first page only)', async () => {
    const pdfPath = path.join(__dirname, '../__fixtures__/multipage.pdf');
    const pdfBuffer = fs.readFileSync(pdfPath);

    const base64 = await renderPdfToImage(pdfBuffer, { pageIndex: 0 });

    expect(base64.length).toBeGreaterThan(5000);
  });
});
```

### 8.2 Manual Testing Checklist

**Before Deployment, Verify:**

- [ ] Install all dependencies: `npm install pdfjs-dist sharp canvas pdf-lib`
- [ ] Run: `npm run build` - zero errors
- [ ] Run: `npm run test` - all tests pass
- [ ] Database seeded with system settings: `npm run db:seed`
- [ ] Upload valid PDF file
  - [ ] Logs show PDF rendered (not placeholder)
  - [ ] LLM receives actual music sheet image
  - [ ] Extraction completes with confidence > 80
- [ ] Session appears in review UI within 2 seconds
- [ ] Click "Preview" button shows PDF image + metadata side-by-side
- [ ] Edit metadata, click "Approve"
  - [ ] MusicPiece created
  - [ ] MusicFile created
  - [ ] For multi-part: multiple MusicFiles created (one per part)
  - [ ] Composer/Publisher created if needed
  - [ ] Instruments created/assigned
- [ ] Check admin music library - piece appears with correct parts
- [ ] Member logs in, can download their assigned part only
- [ ] Upload PDF with low confidence (e.g., poor quality scan)
  - [ ] Confidence score < 85
  - [ ] Verification pass triggered
  - [ ] Two-pass result shown in UI

---

## PART 9: ERROR HANDLING & EDGE CASES

### 9.1 Handle Common Error Scenarios

**Scenario 1: PDF too large**
- Current limit: env.MAX_FILE_SIZE
- Error message: "File too large. Maximum size is XXX MB"
- ✓ Already implemented

**Scenario 2: PDF corrupted**
- When: PDF magic bytes OK but content corrupted
- Action: Log error, create fallback metadata with confidence: 20
- Show: "File upload worked but metadata extraction failed. Please review / edit metadata."

**Scenario 3: PDF is image (scanned score)**
- When: PDF contains no extractable text, only images
- Action: Log warning, attempt OCR fallback or ask for manual entry
- Show: "This appears to be a scanned document. LLM extraction may have lower accuracy."

**Scenario 4: LLM timeout (> 30 seconds)**
- When: LLM provider is overloaded
- Action: Timeout after 30s, use fallback
- Show: "Metadata extraction timeout. Using filename. Please edit."

**Scenario 5: LLM provider not configured**
- When: LLM endpoint unreachable or API key missing
- Action: Skip extraction, create fallback
- Show: "LLM service unavailable. Please configure in settings."
- Important: Admin should be notified in settings UI

---

## PART 10: DOCUMENTATION & CONFIGURATION

### 10.1 Update .env.example

Add these environment variables:

```env
# LLM Configuration (for Smart Upload)
LLM_PROVIDER=ollama                                      # ollama, openai, anthropic, gemini, openrouter, custom
LLM_OLLAMA_ENDPOINT=http://localhost:11434             # Ollama server endpoint
LLM_VISION_MODEL=llama3.2-vision                       # Model for sheet music analysis
LLM_VERIFICATION_MODEL=qwen2.5:7b                      # Model for verification pass

# API Keys (if not using Ollama)
LLM_OPENAI_API_KEY=sk-...
LLM_ANTHROPIC_API_KEY=ant-...
LLM_OPENROUTER_API_KEY=sk-or-...

# Custom Provider
LLM_CUSTOM_BASE_URL=https://api.example.com/v1
LLM_CUSTOM_API_KEY=...

# PDF Processing
ENABLE_PDF_RENDERING=true                              # Set false to disable rendering (use placeholder)
ENABLE_PDF_SPLITTING=true                              # Split multi-part scores
ENABLE_OCR_FALLBACK=true                               # Fallback for image-based PDFs
```

### 10.2 Create/Update Documentation

Add to `/docs/SMART_UPLOAD_COMPLETE.md`:

```markdown
# Smart Music Upload - Complete Implementation Guide

## Overview
The Smart Upload feature allows music library administrators to upload PDF sheet music files and automatically extract metadata using AI/LLM.

## How It Works
1. Admin uploads PDF file (max 5.37MB)
2. System renders first page to image
3. LLM analyzes image, extracts: title, composer, instrument(s), file type
4. Second verification pass checks accuracy if needed
5. Admin reviews extracted metadata in UI
6. For multi-part scores: system automatically splits PDF by part
7. Admin approves → system creates MusicPiece + MusicFiles + MusicParts
8. Members can download assigned parts from music library

## Configuration
Configure LLM provider in: Admin→Settings→Smart Upload Settings

Supported providers:
- **Ollama** (local, free, recommended for development)
- **OpenAI** (requires API key)
- **Anthropic** (requires API key)
- **Gemini** (requires API key)
- **OpenRouter** (API key required)
- **Custom** (any OpenAI-compatible endpoint)

## Requirements
- Dependencies: `pdfjs-dist`, `sharp`, `canvas`, `pdf-lib`
- LLM service running and configured
- Music:upload permission for uploading
- Music:create permission for approving

## Troubleshooting

### Upload succeeds but metadata extraction fails
- Check LLM service is running
- Check LLM API key is configured
- Check model names are correct
- Review logs for specific error

### Sessions not appearing in review UI
- Verify user has music:read permission
- Check database: SmartUploadSession table should have records
- Check browser console for JavaScript errors
- Check server logs for permission/query errors

### PDF doesn't render (placeholder used)
- Check pdfjs-dist is installed: `npm list pdfjs-dist`
- Check canvas module is installed and built: `npm list canvas`
- Try restarting dev server
- Check server logs for rendering errors

### Multi-part score not split
- Verify ENABLE_PDF_SPLITTING=true
- Check LLM returned isMultiPart: true and parts array
- Check server logs for splitting errors
- May need to manually split if LLM doesn't detect parts correctly
```

---

## PART 11: FINAL INTEGRATION CHECKLIST

**Before changing status to COMPLETE, verify:**

- [ ] All 4 PDF libraries installed and working
- [ ] System settings initialized and populated
- [ ] PDF rendering service created and tested
- [ ] PDF splitter service created
- [ ] Smart upload route updated to use real PDF rendering
- [ ] Verify pass logic improved (don't verify garbage metadata)
- [ ] Session visibility bug fixed
- [ ] Preview dialog component created
- [ ] Preview button integrated into review table
- [ ] Pre-fetching implemented on review page
- [ ] Multi-part approval logic implemented
- [ ] Part splitting tested with sample PDFs
- [ ] Error handling comprehensive
- [ ] All tests passing: `npm run test:run`
- [ ] Build succeeds: `npm run build`
- [ ] Manual end-to-end test successful:
  - [ ] Upload valid PDF → extracted metadata shows
  - [ ] Edit metadata in preview
  - [ ] Approve → MusicPiece + MusicFiles created
  - [ ] Multi-part PDF → creates multiple files per part
  - [ ] Member can access their parts
- [ ] No lint warnings: `npm run lint`
- [ ] No TypeScript errors: `tsc --noEmit`
- [ ] Documentation updated

---

## SUMMARY

This exhaustive prompt covers:

1. **Dependency Installation** - Add required PDF libraries
2. **System Initialization** - Populate default LLM settings
3. **PDF Rendering Service** - Replace placeholder with real rendering
4. **OCR Fallback** - Handle image-based PDFs gracefully
5. **Smart Upload Route** - Update to use real PDF + better error handling
6. **Review UI Fixes** - Debug and fix session visibility
7. **PDF Preview** - Add visual validation to approval workflow
8. **Multi-Part Support** - Detect and split scores by part
9. **Approval Enhancement** - Create parts when splitting PDFs
10. **Testing & Verification** - Comprehensive testing checklist
11. **Error Handling** - Handle edge cases gracefully
12. **Documentation** - Complete setup and troubleshooting guide

**Target Outcome:** Smart upload workflow that actually improves on manual upload, with proper LLM extraction, visual validation, multi-part support, and end-to-end functionality.
