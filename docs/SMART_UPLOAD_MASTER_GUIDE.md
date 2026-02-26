# Smart Upload Master Implementation Guide (MVP)

**Target:** Fully functional Smart Upload MVP with Google AI Studio, OpenRouter, and OpenAI.
**Status:** Execution Ready

This guide consolidates all audit findings and upgrade plans into a single execution path. Follow these steps in order to resolve the "Placeholder Image" bug and ensure end-to-end functionality.

---

## Phase 1: Dependencies & Environment (The Foundation)

The system cannot render PDFs without these specific packages.

### 1.1 Install Critical Packages
Run this command to ensure the rendering engine is present:

```bash
npm install pdfjs-dist@^3.11.174 sharp canvas pdf-lib @types/sharp
```

### 1.2 Verify Environment Variables
Ensure your `.env` file uses the standardized `LLM_*` prefix.

```env
# Provider Selection (Choose one for default)
LLM_PROVIDER="openrouter" 

# API Keys
LLM_OPENROUTER_API_KEY="sk-or-..."
LLM_OPENAI_API_KEY="sk-..."
LLM_GEMINI_API_KEY="AIza..."

# Models (Optional overrides)
LLM_VISION_MODEL="google/gemini-2.0-flash-exp:free"
```

### 1.3 Seed System Settings
Ensure the database has the default configuration rows.

```bash
npm run db:seed
```

---

## Phase 2: Core Services Implementation (The Fix)

You must replace the placeholder logic with actual PDF rendering.

### 2.1 Create/Update `src/lib/services/pdf-renderer.ts`

This service converts PDF pages to base64 images for the LLM.

```typescript
import * as pdfjsLib from 'pdfjs-dist';
import { createCanvas } from 'canvas';
import sharp from 'sharp';
import { logger } from '@/lib/logger';

// Configure worker for Node.js environment
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export async function renderPdfToImage(
  pdfBuffer: Buffer,
  options: { pageIndex?: number; quality?: number; maxWidth?: number } = {}
): Promise<string> {
  const { pageIndex = 0, quality = 85, maxWidth = 1920 } = options;

  try {
    // Load PDF
    const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
    
    if (pageIndex >= pdf.numPages) {
      throw new Error(`Page ${pageIndex} out of bounds (Total: ${pdf.numPages})`);
    }

    const page = await pdf.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 2.0 }); // 2x for clarity

    // Render to Canvas
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    
    await page.render({
      canvasContext: context as any,
      viewport,
    }).promise;

    // Convert to Buffer
    let imageBuffer = canvas.toBuffer('image/png');

    // Resize if needed (Sharp)
    if (viewport.width > maxWidth) {
      imageBuffer = await sharp(imageBuffer)
        .resize(maxWidth)
        .png()
        .toBuffer();
    }

    // Return Base64
    return imageBuffer.toString('base64');
  } catch (error) {
    logger.error('PDF Rendering Failed', { error });
    throw error;
  }
}
```

### 2.2 Create `src/lib/services/ocr-fallback.ts`

Handle cases where PDF rendering fails (e.g., corrupted files).

```typescript
export function generateOCRFallback(filename: string) {
  return {
    title: filename.replace(/\.pdf$/i, '').replace(/[-_]/g, ' '),
    confidenceScore: 20,
    isScanned: true
  };
}
```

---

## Phase 3: API Route Logic (The Wiring)

Update the upload handler to use the real renderer.

### 3.1 Update `src/app/api/files/smart-upload/route.ts`

Locate the `convertPdfToImage` function and replace the placeholder logic.

**Logic Flow:**
1.  Receive `FormData` with PDF.
2.  Call `renderPdfToImage(buffer)`.
3.  **IF Success:** Send base64 image to `callVisionLLM`.
4.  **IF Fail:** Call `generateOCRFallback` and skip LLM (or send filename to LLM).
5.  Save `SmartUploadSession` to DB.

**Critical Fix for LLM Call:**
Ensure the `callVisionLLM` function uses the correct adapter based on `LLM_PROVIDER`.

```typescript
// Pseudo-code for route handler integration
const { image } = await renderPdfToImage(buffer);

const metadata = await callVisionLLM(image, {
  provider: settings.provider, // 'openrouter', 'openai', 'google'
  apiKey: settings.apiKey,
  model: settings.visionModel
});
```

---

## Phase 4: UI & Review (The User Experience)

Ensure the data is visible to the admin.

### 4.1 Fix Review Page Visibility
**File:** `src/app/(admin)/admin/uploads/review/page.tsx`

If sessions exist in the DB but not the UI, check the API response transformation.

*   **Check:** Does the API return `uploadSessionId` but the UI expects `id`?
*   **Fix:** Ensure the mapping in the `fetchSessions` function matches the API response.

### 4.2 Add PDF Preview Dialog
Create `src/components/admin/music/upload-preview-dialog.tsx`.

*   It should accept `renderedImage` (base64) and `extractedMetadata`.
*   Display them side-by-side so the admin can verify the AI's work.

---

## Phase 5: Verification Checklist

Perform these tests to certify MVP status.

### 5.1 Configuration Test
1.  Go to **Admin > Settings > Smart Upload**.
2.  Select **OpenRouter**.
3.  Click **Test Connection**.
4.  **Expected:** "Successfully connected".

### 5.2 Upload Test (The "Happy Path")
1.  Go to **Admin > Music > Upload**.
2.  Upload a clear, digital PDF (not a scan).
3.  **Expected Logs:**
    *   `Processing PDF...`
    *   `PDF rendered to image (size: ...)` (NOT 1x1 pixel)
    *   `Vision model extraction complete (confidence: >80)`
4.  **Expected UI:**
    *   Redirect to Review page.
    *   Session appears in list.
    *   Metadata (Title, Composer) is populated.

### 5.3 Fallback Test
1.  Upload a corrupted PDF or non-music PDF.
2.  **Expected:** System should not crash. Should return fallback metadata (Filename as title) with low confidence.

---

## Troubleshooting Common Errors

### "GlobalWorkerOptions.workerSrc specified" Error
*   **Cause:** `pdfjs-dist` version mismatch or missing worker configuration.
*   **Fix:** Ensure the code in `2.1` is used, specifically setting the `workerSrc` to the CDN or local file.

### "401 Unauthorized" from LLM
*   **Cause:** Database has empty API key settings overriding `.env`.
*   **Fix:** Run `npm run db:seed` or manually update settings in the Admin UI.

### "JSON Parse Error"
*   **Cause:** LLM returned markdown blocks (```json ... ```).
*   **Fix:** Ensure your JSON parser utility strips markdown code fences before parsing.

---

## Next Steps (Post-MVP)

Once this MVP is stable:
1.  Implement **Part Splitting** (Phase 2 of Upgrade Plan).
2.  Add **Background Jobs** (BullMQ) for processing large files.
3.  Enable **Auto-Approval** for high-confidence matches.
