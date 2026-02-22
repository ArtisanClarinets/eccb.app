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
8. [Confidence Scoring](#confidence-scoring)
9. [Testing](#testing)
10. [Troubleshooting](#troubleshooting)

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

---

## Configuration

### Environment Variables

Add these variables to your `.env` file:

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_OLLAMA_ENDPOINT` | `http://localhost:11434` | Ollama API endpoint |
| `LLM_VISION_MODEL` | `llama3.2-vision` | Vision model for first-pass extraction |
| `LLM_VERIFICATION_MODEL` | `qwen2.5:7b` | Verification model for second-pass |

### Example Configuration

```bash
# LLM Configuration (Smart Upload)
LLM_OLLAMA_ENDPOINT="http://localhost:11434"
LLM_VISION_MODEL="llama3.2-vision"
LLM_VERIFICATION_MODEL="qwen2.5:7b"
```

### Ollama Setup

Smart Upload requires [Ollama](https://github.com/ollama/ollama) to be running locally or on a remote server:

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull required models
ollama pull llama3.2-vision
ollama pull qwen2.5:7b

# Start Ollama service
ollama serve
```

---

## Security

Smart Upload inherits all security measures from the existing platform:

### Authentication & Authorization

- All endpoints require valid session authentication
- Upload requires `MUSIC_UPLOAD` permission
- Review/Approve requires `music:create` permission
- Reject requires `music:edit` permission

### CSRF Protection

All mutating endpoints (POST, PUT, DELETE) validate CSRF tokens via [`src/lib/csrf.ts`](src/lib/csrf.ts).

### Rate Limiting

Smart upload is rate-limited to 10 requests per minute via [`src/lib/rate-limit.ts`](src/lib/rate-limit.ts).

### File Validation

- MIME type validation (only `application/pdf` accepted)
- Magic byte validation (verifies PDF header `%PDF`)
- File size validation (max 50MB)

### Logging

All upload events are logged with user context for audit purposes:

- Upload attempts (success/failure)
- Approval/rejection actions
- LLM processing errors

---

## LLM Models

The system uses two LLMs in sequence:

### Vision Model (First Pass)

| Model | Purpose | Strengths |
|-------|---------|-----------|
| `llama3.2-vision` | Initial metadata extraction | Vision-capable, understands sheet music layout |

The vision model receives the first page of the PDF as an image and extracts:
- Title (from header/footer)
- Composer name
- Publisher information
- Instrumentation
- Part numbers
- Score type classification

### Verification Model (Second Pass)

| Model | Purpose | Strengths |
|-------|---------|-----------|
| `qwen2.5:7b` | Metadata verification | Fast, accurate, good at JSON output |

The verification model reviews the first-pass extraction and:
- Checks for typos in title/composer
- Validates file type classification
- Ensures instrument identification is correct
- Identifies any missing parts

### Why Two Models?

1. **Specialization**: Vision models are larger and slower; using them only when necessary improves performance
2. **Verification**: A second opinion catches errors the first model might miss
3. **Cost/Performance**: Skipping verification for high-confidence (>90) extractions saves resources

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
