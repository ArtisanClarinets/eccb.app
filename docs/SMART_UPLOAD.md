# Smart Upload Documentation

This document describes the Smart Upload feature, which uses Large Language Models (LLMs) with vision capabilities to automatically extract metadata from uploaded music PDF files. The system provides a two-pass extraction process for accurate metadata capture with human review workflow.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [User Flow](#user-flow)
4. [API Endpoints](#api-endpoints)
5. [Configuration](#configuration)
6. [Security](#security)
7. [LLM Models](#llm-models)
8. [System Prompts](#system-prompts)
9. [Confidence Scoring](#confidence-scoring)
10. [Testing](#testing)
11. [Troubleshooting](#troubleshooting)

---

## Overview

Smart Upload is an AI-powered feature that streamlines the process of adding music files to the band's digital library. Instead of manually entering metadata (title, composer, instrument, etc.) for each uploaded PDF, the system uses vision-enabled LLMs to:

- **Extract metadata automatically** from the first page of sheet music PDFs
- **Identify multi-part scores** and individual instrument parts
- **Classify file types** (full score, conductor score, part, condensed score)
- **Provide confidence scores** to indicate extraction reliability

This reduces manual data entry time and helps maintain consistent metadata across the music library.

---

## Architecture

The Smart Upload system consists of several interconnected components:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SMART UPLOAD ARCHITECTURE                         │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐         ┌─────────────────────┐         ┌──────────────┐
  │   FRONTEND   │         │     API ROUTES      │         │  DATABASE    │
  └──────┬───────┘         └──────────┬──────────┘         └──────┬───────┘
         │                              │                            │
         │  1. Upload PDF               │                            │
         ├──────────────────────────────►                            │
         │                              │  2. Store in staging       │
         │                              ├────────────────────────────►│
         │                              │                            │
         │                              │  3. Return session +       │
         │                              │     extracted metadata     │
         │◄─────────────────────────────┤                            │
         │                              │                            │
  ┌──────┴───────┐         ┌──────────┴──────────┐                   │
  │  REVIEW PAGE │         │   LLM INTEGRATION   │                   │
  └──────────────┘         └─────────────────────┘                   │
         │                                                               
         │  4. View/Edit metadata & approve/reject                    
         │                                                               
         ▼                                                               
  ┌──────────────────────────────────────────────┐                    
  │        Music Library (MusicPiece/Part)      │                    
  └──────────────────────────────────────────────┘                    
```

### Components

| Component | Location | Description |
|-----------|----------|-------------|
| API Route | [`src/app/api/files/smart-upload/route.ts`](src/app/api/files/smart-upload/route.ts) | Main upload endpoint with two-pass LLM extraction |
| Review UI | [`src/app/(admin)/admin/uploads/review/page.tsx`](src/app/(admin)/admin/uploads/review/page.tsx) | Admin interface for reviewing extracted metadata |
| Review API | [`src/app/api/admin/uploads/review/`](src/app/api/admin/uploads/review/) | Endpoints for listing, approving, and rejecting uploads |
| **Settings Form** | [`src/app/(admin)/admin/uploads/settings/page.tsx`](src/app/(admin)/admin/uploads/settings/page.tsx) | Admin UI for configuring LLM provider, models, and prompts |
| **Settings API** | [`src/app/api/admin/uploads/settings/`](src/app/api/admin/uploads/settings/) | Endpoints for settings CRUD, model fetching, and testing |
| **Model Fetching** | [`src/lib/llm/model-fetcher.ts`](src/lib/llm/model-fetcher.ts) | Unified API for fetching models from all providers |
| **Bootstrap/Init** | [`src/lib/llm/bootstrap.ts`](src/lib/llm/bootstrap.ts) | Initializes default settings on first run |
| Database | [`prisma/migrations/20260221192207_smart_upload_staging/`](prisma/migrations/20260221192207_smart_upload_staging/) | SmartUploadSession table and related schema |

### Database Schema

The `SmartUploadSession` table stores all upload metadata:

| Field | Type | Description |
|-------|------|-------------|
| `id` | VARCHAR(191) | Primary key |
| `uploadSessionId` | VARCHAR(191) | Unique session identifier (UUID) |
| `fileName` | VARCHAR(191) | Original filename |
| `fileSize` | INTEGER | File size in bytes |
| `mimeType` | VARCHAR(191) | MIME type (application/pdf) |
| `storageKey` | VARCHAR(191) | Blob storage path |
| `extractedMetadata` | JSON | LLM-extracted metadata |
| `confidenceScore` | INTEGER | Extraction confidence (1-100) |
| `status` | ENUM | PENDING_REVIEW, APPROVED, REJECTED |
| `uploadedBy` | VARCHAR(191) | User who uploaded |
| `reviewedBy` | VARCHAR(191) | Admin who reviewed |
| `reviewedAt` | DATETIME | Review timestamp |

---

## User Flow

The Smart Upload process follows these steps:

### Step 1: Upload PDF

1. User navigates to the music upload page
2. User selects a PDF file (only PDF supported)
3. System validates file type and size
4. File is uploaded to the API endpoint

### Step 2: LLM Processing

1. **First Pass (Vision Model)**: The vision-enabled LLM analyzes the first page of the PDF and extracts:
   - Title
   - Composer
   - Publisher
   - Instrument/Ensemble
   - Part number
   - File type (FULL_SCORE, CONDUCTOR_SCORE, PART, CONDENSED_SCORE)
   - Multi-part information

2. **Second Pass (Verification Model)**: If confidence score is below 90, a second LLM verifies and corrects the extracted metadata

3. File is stored in blob storage under `smart-upload/{sessionId}/original.pdf`

### Step 3: Admin Review

1. Admin navigates to `/admin/uploads/review`
2. Views list of pending uploads with confidence scores
3. Clicks "Review" to see extracted metadata
4. Can edit metadata fields if needed
5. Approves (creates MusicPiece) or rejects the upload

### Step 4: Music Library Integration

Upon approval:
- MusicPiece record is created
- MusicFile record links to the stored PDF
- Upload session is marked as APPROVED

---

## API Endpoints

### Upload Endpoint

**POST** `/api/files/smart-upload`

Uploads a PDF and extracts metadata using LLMs.

| Aspect | Details |
|--------|---------|
| Authentication | Required (session) |
| Permission | `MUSIC_UPLOAD` |
| Content-Type | `multipart/form-data` |
| Rate Limit | 10 requests/minute |

**Request Body:**

```typescript
// FormData
{
  file: File; // PDF file, max 50MB
}
```

**Response:**

```typescript
{
  success: true;
  session: {
    id: string;           // Upload session ID
    fileName: string;    // Original filename
    confidenceScore: number;
    status: 'PENDING_REVIEW';
    createdAt: Date;
  };
  extractedMetadata: {
    title: string;
    composer?: string;
    publisher?: string;
    instrument?: string;
    partNumber?: string;
    confidenceScore: number;
    fileType?: 'FULL_SCORE' | 'CONDUCTOR_SCORE' | 'PART' | 'CONDENSED_SCORE';
    isMultiPart?: boolean;
    parts?: Array<{ instrument: string; partName: string }>;
  };
  message: string;
}
```

### Review Endpoints

**GET** `/api/admin/uploads/review`

Lists upload sessions for review.

| Aspect | Details |
|--------|---------|
| Authentication | Required |
| Permission | `music:read` |
| Query Params | `status` (PENDING_REVIEW, APPROVED, REJECTED) |

**Response:**

```typescript
{
  sessions: SmartUploadSession[];
  stats: {
    pending: number;
    approved: number;
    rejected: number;
  };
}
```

**POST** `/api/admin/uploads/review/[id]/approve`

Approves an upload and optionally creates a MusicPiece.

| Aspect | Details |
|--------|---------|
| Authentication | Required |
| Permission | `music:create` |

**Request Body:**

```typescript
{
  title: string;           // Required
  composer?: string;
  publisher?: string;
  instrument?: string;
  partNumber?: string;
  difficulty?: string;
}
```

**POST** `/api/admin/uploads/review/[id]/reject`

Rejects an upload.

| Aspect | Details |
|--------|---------|
| Authentication | Required |
| Permission | `music:edit` |

**Request Body:**

```typescript
{
  reason?: string;        // Optional rejection reason
}
```

### Settings API Endpoints

**GET** `/api/admin/uploads/settings`

Returns current Smart Upload settings.

| Aspect | Details |
|--------|---------|
| Authentication | Required |
| Permission | `admin:read` |

**Response:**

```typescript
{
  provider: string;
  endpoint: string;
  apiKey: string;        // Masked as "__SET__" or "__UNSET__"
  visionModel: string;
  verificationModel: string;
  visionSystemPrompt: string;
  verificationSystemPrompt: string;
}
```

---

**PUT** `/api/admin/uploads/settings`

Updates Smart Upload settings. Validates all inputs using strict schema and rejects invalid provider/model combinations. Secrets are preserved when using placeholder values (`__SET__`).

| Aspect | Details |
|--------|---------|
| Authentication | Required |
| Permission | `admin:write` |
| Content-Type | `application/json` |

**Request Body:**

```typescript
{
  provider: 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'custom';
  endpoint?: string;           // Optional, uses provider default
  apiKey?: string;             // Use "__SET__" to preserve existing
  visionModel: string;
  verificationModel: string;
  visionSystemPrompt?: string;
  verificationSystemPrompt?: string;
}
```

**Response:**

```typescript
{
  success: true;
  settings: {
    provider: string;
    endpoint: string;
    visionModel: string;
    verificationModel: string;
  };
}
```

---

**POST** `/api/admin/uploads/settings/reset-prompts`

Resets system prompts to canonical defaults.

| Aspect | Details |
|--------|---------|
| Authentication | Required |
| Permission | `admin:write` |

**Response:**

```typescript
{
  success: true;
  prompts: {
    visionSystemPrompt: string;
    verificationSystemPrompt: string;
  };
}
```

---

**POST** `/api/admin/uploads/settings/test`

Tests connectivity to the configured LLM provider.

| Aspect | Details |
|--------|---------|
| Authentication | Required |
| Permission | `admin:write` |
| Content-Type | `application/json` |

**Request Body:**

```typescript
{
  provider: string;
  endpoint: string;
  apiKey?: string;
  model: string;
}
```

**Response:**

```typescript
{
  ok: boolean;
  message?: string;      // Success message
  error?: string;        // Error details if failed
}
```

---

**GET** `/api/admin/uploads/models`

Fetches available models from the provider with recommendation metadata.

| Aspect | Details |
|--------|---------|
| Authentication | Required |
| Permission | `admin:read` |
| Query Params | `provider`, `apiKey` (optional), `endpoint` (optional) |

**Response:**

```typescript
{
  models: Array<{
    id: string;
    name: string;
    description?: string;
    contextWindow?: number;
    pricing?: {
      prompt: number;
      completion: number;
    };
    vision?: boolean;
    deprecated?: boolean;
    recommended?: boolean;     // System recommendation flag
  }>;
  recommended: string | null;  // ID of recommended model
}
```

---

## Security

Smart Upload inherits all security measures from the existing platform:

### Authentication & Authorization

- All endpoints require valid session authentication
- Upload requires `MUSIC_UPLOAD` permission
- Review/Approve requires `music:create` permission
- Reject requires `music:edit` permission
- SSE progress endpoint requires authenticated session

### CSRF Protection

All mutating endpoints (POST, PUT, DELETE) validate CSRF tokens via [`src/lib/csrf.ts`](src/lib/csrf.ts).

### Rate Limiting

Smart upload is rate-limited to 10 requests per minute via [`src/lib/rate-limit.ts`](src/lib/rate-limit.ts).

### API Key Security

- Each provider uses its own dedicated API key stored in `systemSetting` DB rows
- Keys are **never** shared across providers (e.g., an OpenAI key is never sent to OpenRouter)
- The canonical key mapping lives in `src/lib/llm/config-loader.ts`

### File Validation

- MIME type validation (only `application/pdf` accepted)
- Magic byte validation (verifies PDF header `%PDF`)
- File size validation (max 50MB)

### Logging

All upload events are logged with user context for audit purposes:

- Upload attempts (success/failure)
- Approval/rejection actions
- LLM processing errors
- Token usage per LLM call

---

## LLM Models

The system uses two LLMs in sequence:

### Vision Model (First Pass)

Receives up to 8 intelligently-sampled pages of the PDF (always includes first 2 and last page) and extracts:
- Title (from header/footer)
- Composer name
- Publisher information
- Instrumentation
- Part numbers
- Score type classification
- Proposed cutting instructions with page ranges

### Verification Model (Second Pass)

Reviews the first-pass extraction against the actual PDF pages and:
- Checks for typos in title/composer
- Validates file type classification
- Ensures instrument identification is correct
- Assigns a verification confidence score
- Identifies any corrections needed

### Gap Detection

After the vision model returns cutting instructions, the processor checks for **uncovered page ranges**. Any pages not assigned to a part are surfaced as `Unlabelled Pages X–Y` entries (part numbers 9900+). These appear as **yellow warning banners** in the review dialog so an admin can investigate.

### Automatic Model Recommendation

The system automatically recommends the best model based on:
1. **Vision capability** (required for reading PDFs)
2. **Non-deprecated status**
3. **Recency** (prefer newer models)
4. **Cost** (prefer cheaper options)
5. **Context window size**

The recommendation algorithm scores models and selects the optimal choice. Admins can override the recommendation by selecting a different model from the dropdown.



### Why Two Models?

1. **Specialization**: Vision models are larger and slower; using them only when necessary improves performance
2. **Verification**: A second opinion catches errors the first model might miss
3. **Cost/Performance**: Skipping verification for high-confidence (>90) extractions saves resources

---

## System Prompts

The Smart Upload system uses two configurable system prompts to control AI behavior during metadata extraction.

### Vision System Prompt (First Pass)

Controls how the AI extracts metadata from PDF pages. The default prompt requests specific JSON output with fields for:
- Title
- Composer
- Arranger
- Publisher
- Parts (instrument, partName, pageRange, notes)
- Cutting instructions with page ranges
- Additional metadata (key, tempo, duration, difficulty, genre, year)

### Verification System Prompt (Second Pass)

Controls how the AI verifies and corrects the first-pass extraction. The verification prompt instructs the AI to check for:
- Typos in titles or composer names
- Misclassifications of file types
- Incorrect instrument identification
- Missing parts
- Wrong page ranges
- Illegible text

### Resetting Prompts

If custom prompts cause issues (e.g., malformed JSON output), use the **"Reset to Defaults"** button in the Smart Upload Settings page to restore the canonical prompts. This preserves all other settings while resetting only the prompt text.

---

## Confidence Scoring

The confidence score (1-100) indicates how reliable the extracted metadata is:

| Score Range | Color | Meaning | Action Required |
|------------|-------|---------|-----------------|
| 85-100 | Green | High confidence | Minimal review needed |
| 70-84 | Yellow | Medium confidence | Review recommended |
| 1-69 | Red | Low confidence | Careful review required |

### How Scores Are Generated

1. The LLM evaluates legibility of text on the page
2. Ambiguous information (unclear composer, uncertain instrument) reduces score
3. The verification model can adjust the score up or down
4. Fallback metadata (when LLM fails) receives a score of 10

### Confidence Threshold

- **Below 90**: Verification model is triggered for second-pass review
- **Below 85**: Admin UI shows warning badge
- **Below 80**: System flags ambiguous information (e.g., unclear composer name)

---

## Testing

### Running Tests

```bash
# Run all smart-upload tests
npx vitest run src/app/api/files/smart-upload

# Run specific test file
npx vitest run src/app/api/files/smart-upload/__tests__/route.test.ts
```

### Test Coverage

The test suite covers:

| Category | Tests |
|----------|-------|
| Authentication | 401 on no session, 401 on missing user ID, 403 on missing permission |
| File Validation | 400 on no file, 400 on file too large, 400 on invalid MIME type |
| CSRF | 403 on CSRF validation failure |
| Upload Flow | Successful upload with metadata extraction |
| Confidence | Verification triggered below 90, skipped at 90+ |
| Error Handling | Database failure, storage failure, LLM failure |
| CORS | OPTIONS handler returns correct headers |

### Mock Files

Test mocks are located in [`src/app/api/files/smart-upload/__tests__/mocks.ts`](src/app/api/files/smart-upload/__tests__/mocks.ts):

```typescript
// Example mock metadata
VALID_METADATA_HIGH_CONFIDENCE = {
  title: 'Symphony No. 5',
  composer: 'Ludwig van Beethoven',
  confidenceScore: 95,
  fileType: 'FULL_SCORE',
};

AMBIGUOUS_COMPOSER_METADATA = {
  title: 'Concert Piece',
  composer: '???',  // Illegible
  confidenceScore: 65,
};
```

---

## Troubleshooting

### Common Issues

#### 1. LLM Connection Failed

**Symptom**: Upload fails with "LLM call failed" error

**Solutions**:
- Verify Ollama is running: `ollama serve`
- Check `LLM_OLLAMA_ENDPOINT` in environment
- Ensure models are installed: `ollama list`

```bash
# Verify Ollama is running
curl http://localhost:11434/api/tags

# Check installed models
ollama list
```

#### 2. Vision Model Not Available

**Symptom**: Error message mentions vision model failure

**Solutions**:
- Pull the vision model: `ollama pull llama3.2-vision`
- Verify model supports vision: Check Ollama model list

#### 3. Low Confidence Scores

**Symptom**: All uploads show confidence below 70

**Possible Causes**:
- PDF scanned image (not searchable text)
- Poor image quality
- Non-standard sheet music format

**Solutions**:
- Ensure PDFs are text-searchable (not scanned images)
- Verify first page contains title/composer information
- Review manually and approve with corrections

#### 4. Uploaded File Not Found

**Symptom**: After approval, PDF cannot be accessed

**Check**:
- Blob storage is configured correctly
- File was uploaded to `smart-upload/{sessionId}/original.pdf`
- Storage service is running

#### 5. Rate Limit Exceeded

**Symptom**: "Too many requests" error

**Solution**: Wait 1 minute before retrying (default: 10 requests/minute)

#### 6. Model Fetch Failed

**Symptom**: Model dropdown shows "No models available"

**Solutions**:
- Verify API key is entered correctly
- Check provider status page
- For Ollama, ensure Ollama is running: `curl http://localhost:11434/api/tags`
- Verify network connectivity to the provider endpoint
- Check browser console for CORS errors

#### 7. Prompt Reset Needed

**Symptom**: Metadata extraction returns malformed JSON or unexpected format

**Solution**: Go to **Smart Upload Settings** and click **"Reset to Defaults"** for system prompts

### Execution Context

Each upload session stores execution context for debugging purposes. This information is visible in the review interface to help diagnose extraction issues.

**Stored Context:**
- **Provider used** - Which LLM provider processed the upload
- **Vision model** - Model used for first-pass extraction
- **Verification model** - Model used for second-pass verification (if applicable)
- **Prompt version** - Version of system prompts used
- **Model parameters** - Temperature, max tokens, and other parameters

**Accessing Context:**
The execution context is displayed in the upload review dialog under the "Debug Info" section. This helps administrators understand why certain extractions may have failed or produced unexpected results.

### Debug Logging

Enable detailed logging by checking the application logs:

```bash
# Tail logs
tail -f logs/app-2026-02-21.log | grep "smart-upload"
```

Look for these log events:
- `Processing smart upload` - Upload received
- `Vision model extraction complete` - First pass done
- `Verification model complete` - Second pass done
- `Smart upload session created` - Database record created

### Database Queries

Check pending uploads directly:

```sql
SELECT 
  id, 
  file_name, 
  confidence_score, 
  status, 
  created_at 
FROM smart_upload_sessions 
WHERE status = 'PENDING_REVIEW';
```

---

## Related Documentation

- [DEPLOYMENT.md](../DEPLOYMENT.md) - Deployment considerations
- [SECURITY.md](../SECURITY.md) - Security practices
- [ARCHITECTURE.md](../ARCHITECTURE.md) - System architecture
- [PERMISSIONS.md](../PERMISSIONS.md) - Permission system
