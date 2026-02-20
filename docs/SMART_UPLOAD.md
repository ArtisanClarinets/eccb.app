# Smart Upload

Smart Upload is an AI-powered feature that enables librarians and administrators to efficiently add music to the library by automatically extracting metadata from uploaded files, splitting packet PDFs into individual parts, and preparing the music for review before ingestion into the music library.

## Overview

Smart Upload streamlines the process of adding new music to the band's library by automating several traditionally manual tasks:

- **Automated Metadata Extraction**: Uses AI to extract title, composer, arranger, difficulty, genre, and other metadata from PDF and audio files
- **PDF Packet Splitting**: Automatically detects and splits multi-part PDF packets into individual instrument parts
- **Smart Part Classification**: Identifies which pages belong to which instrument using AI analysis
- **Review Workflow**: Provides a review interface for librarians to verify and correct AI-extracted metadata before approval
- **Batch Processing**: Handle multiple files in a single upload session

## Requirements

### Environment Configuration

Before using Smart Upload, ensure the following environment variables are configured in your `.env` file:

```bash
# Enable Smart Upload feature
SMART_UPLOAD_ENABLED=true

# Optional: Configure file limits (defaults shown)
SMART_UPLOAD_MAX_FILES=20
SMART_UPLOAD_MAX_TOTAL_BYTES=524288000  # 500MB

# Optional: OCR mode for PDF processing
# Options: pdf_text (built-in), tesseract, ocrmypdf, vision_api
SMART_UPLOAD_OCR_MODE="pdf_text"
```

### AI Provider Setup

Smart Upload requires an AI provider for metadata extraction. See [AI_PROVIDERS.md](./AI_PROVIDERS.md) for detailed configuration instructions.

```bash
# Required: Select AI provider
AI_PROVIDER=openai  # Options: openai, anthropic, gemini, openrouter, openai_compat, kilo, custom

# Provider-specific API key (see AI_PROVIDERS.md for details)
OPENAI_API_KEY=sk-...
```

### Worker Requirements

Smart Upload requires the background worker to be running for batch processing:

```bash
# Start the worker process
npm run start:workers
```

The worker handles asynchronous processing of uploaded files, including:
- PDF text extraction and OCR
- AI metadata extraction
- PDF splitting and part classification

### Permissions

Users must have the `music.smartUpload` permission to access the Smart Upload feature. This can be assigned through the admin roles interface.

## Supported File Types

Smart Upload supports the following file types:

| Category | MIME Types | Description |
|----------|------------|-------------|
| **PDF** | `application/pdf` | Sheet music packets, individual parts |
| **Audio** | `audio/mpeg`, `audio/mp3`, `audio/wav`, `audio/x-wav`, `audio/ogg`, `audio/webm` | Audio recordings, practice tracks |
| **Images** | `image/jpeg`, `image/jpg`, `image/png`, `image/gif`, `image/webp`, `image/tiff`, `image/bmp` | Scanned sheet music (future support) |
| **Music XML** | `application/vnd.recordare.musicxml`, `application/xml` | Digital music notation (future support) |

### File Size Limits

| Limit | Default Value | Configurable |
|-------|---------------|--------------|
| Maximum individual file size | 100 MB | No |
| Maximum files per batch | 20 | Yes (`SMART_UPLOAD_MAX_FILES`) |
| Maximum total batch size | 500 MB | Yes (`SMART_UPLOAD_MAX_TOTAL_BYTES`) |

## Workflow

Smart Upload follows a structured workflow from initial upload through final ingestion into the music library.

### Step 1: Create Upload Batch

1. Navigate to **Music Library** → **Smart Upload** in the admin dashboard
2. Click **New Upload** to create a new batch
3. A new batch is created with status `CREATED`

### Step 2: Upload Files

1. Drag and drop files onto the upload area, or click to select files
2. Files are validated for type and size
3. Valid files are uploaded to storage and added to the batch
4. Batch status changes to `UPLOADING` during upload, then `PROCESSING` when complete

### Step 3: AI Processing (Automatic)

The background worker processes each uploaded file:

1. **Text Extraction**: Extracts text content from PDFs using the configured OCR mode
2. **Metadata Extraction**: Uses AI to analyze the extracted text and generate metadata:
   - Title
   - Composer
   - Arranger
   - Publisher
   - Difficulty level
   - Genre
   - Style
   - Instrumentation
   - Duration (for audio files)
   - Notes
3. **Part Classification**: For PDF packets, AI analyzes the content to identify which pages belong to which instrument
4. Each item's status updates to `COMPLETE` or `FAILED` based on processing results

### Step 4: Review and Edit

1. Navigate to the batch detail page to review processed files
2. For each file, review the AI-extracted metadata:
   - Verify title, composer, arranger are correct
   - Set difficulty level from the dropdown
   - Add or correct instrumentation
   - Add any notes
3. For PDF packets, verify the part mappings:
   - Review which pages are assigned to each instrument
   - Use the part mapping editor to adjust page assignments
   - Mark parts as optional if needed
4. Make corrections as needed - these will override the AI-extracted values

### Step 5: Approval

1. Once review is complete, approve individual items or the entire batch
2. Click **Approve** on each item, or use **Approve All** for the batch
3. Approved items are marked with status `APPROVED`
4. Batch status changes to `NEEDS_REVIEW` when all items are approved

### Step 6: Ingestion

1. After all items are approved, click **Ingest to Library**
2. The system creates MusicPiece, MusicFile, and MusicPart records
3. Each item's status changes to `COMPLETE`
4. Batch status changes to `COMPLETE`
5. The music is now available in the music library

## Batch Statuses

| Status | Description |
|--------|-------------|
| `CREATED` | Batch created, no files uploaded yet |
| `UPLOADING` | Files are being uploaded to the batch |
| `PROCESSING` | Worker is processing uploaded files |
| `NEEDS_REVIEW` | All files processed, awaiting librarian review |
| `INGESTING` | Batch is being ingested into the music library |
| `COMPLETE` | Batch successfully completed |
| `FAILED` | Batch failed (check error summary) |
| `CANCELLED` | Batch was cancelled by user |

## Item Statuses

| Status | Description |
|--------|-------------|
| `CREATED` | Item added to batch, not yet processed |
| `UPLOADING` | File is being uploaded |
| `PROCESSING` | Worker is extracting metadata |
| `COMPLETE` | Processing complete, ready for review |
| `APPROVED` | Item approved, ready for ingestion |
| `INGESTING` | Item is being ingested |
| `COMPLETE` | Successfully ingested into library |
| `FAILED` | Processing failed (check error message) |
| `CANCELLED` | Item was cancelled |

## Processing Steps

Each file goes through the following processing steps:

1. **UPLOAD**: File uploaded to storage
2. **EXTRACT**: Text extracted from PDF or metadata read from audio
3. **CLASSIFY**: AI analyzes content and extracts metadata
4. **SPLIT** (PDF packets only): PDF split into individual parts
5. **REVIEW**: Awaiting librarian review
6. **APPROVE**: Approved by librarian
7. **INGEST**: Added to music library

## Troubleshooting

### Feature Not Available

**Symptom**: "Feature not available" error when accessing Smart Upload

**Solution**: Ensure `SMART_UPLOAD_ENABLED=true` is set in your environment variables and the server has been restarted.

### No AI Provider Configured

**Symptom**: "Missing API key" errors during processing

**Solution**: Configure an AI provider. See [AI_PROVIDERS.md](./AI_PROVIDERS.md) for setup instructions.

### Files Not Processing

**Symptom**: Files upload but status stays at `PROCESSING`

**Solution**: Ensure the background worker is running:

```bash
npm run start:workers
```

Check worker logs for errors.

### PDF Text Extraction Fails

**Symptom**: "PDF extraction failed" errors

**Solution**: 
- If the PDF contains scanned images, configure a different OCR mode:
  ```bash
  SMART_UPLOAD_OCR_MODE=vision_api  # Requires Google Cloud Vision API
  # or
  SMART_UPLOAD_OCR_MODE=ocrmypdf   # Requires OCRmyPDF installation
  ```
- For password-protected PDFs, remove protection before uploading

### Metadata Extraction Quality

**Symptom**: AI extracts incorrect or incomplete metadata

**Solution**:
- Review and correct metadata in the review step before approval
- Try a different AI provider for better results
- For better extraction quality, use scanned PDFs with clear, readable text

### Batch Fails During Ingestion

**Symptom**: "Ingestion failed" error

**Solution**:
- Check that required fields (title, composer) are filled in
- Verify instrument mappings are valid
- Review error message for specific details

## Failure Modes and Retry Behavior

### Automatic Retries

The worker automatically retries failed operations with exponential backoff:

- **Transient failures** (network timeout, temporary unavailability): Up to 3 retries
- **AI processing failures**: Up to 2 retries with reduced complexity

### Manual Recovery

For items that fail permanently:

1. Navigate to the batch detail page
2. Identify the failed item
3. Click **Retry** to attempt processing again after making corrections
4. If the file itself is corrupted, delete the item and re-upload

### Cancelled Batches

You can cancel a batch at any time before ingestion:

1. Open the batch
2. Click **Cancel Batch**
3. Uploaded files are retained in storage but marked as cancelled
4. Cancelled batches cannot be resumed

## Configuration Options

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `SMART_UPLOAD_ENABLED` | `false` | Enable/disable the feature |
| `SMART_UPLOAD_MAX_FILES` | `20` | Maximum files per batch |
| `SMART_UPLOAD_MAX_TOTAL_BYTES` | `524288000` | Maximum batch size in bytes |
| `SMART_UPLOAD_OCR_MODE` | `pdf_text` | OCR mode for PDF processing |
| `AI_PROVIDER` | `openai` | AI provider for metadata extraction |
| `AI_MODEL` | provider default | Override default AI model |
| `AI_TEMPERATURE` | `0.1` | AI response creativity (0.0-2.0) |

## Related Documentation

- [AI_PROVIDERS.md](./AI_PROVIDERS.md) - AI provider configuration
- [PERMISSIONS.md](../PERMISSIONS.md) - Permission system
- [DATABASE_SCHEMA.md](../DATABASE_SCHEMA.md) - Database models




## Smart Upload Files Created in the first iteration:
All files modified when smart_upload was added:
@/env.example @/next.config.ts @/package-lock.json @/package.json @/README.md @/tsconfig.app.json @/tsconfig.json @/docs/AI_PROVIDERS.md @/docs/SMART_UPLOAD.md @/prisma/schema.prisma @/prisma/seed.ts @/prisma/migrations/20260220000842_smart_upload/migration.sql @/src/app/(admin)/admin/music/page.tsx @/src/app/(admin)/admin/music/smart-upload/page.tsx @/src/app/(admin)/admin/music/smart-upload/smart-upload-client.tsx @/src/app/(admin)/admin/music/smart-upload/[batchId]/batch-detail-client.tsx @/src/app/(admin)/admin/music/smart-upload/[batchId]/page.tsx @/src/app/api/admin/jobs/route.ts @/src/app/api/music/smart-upload/route.ts @/src/app/api/music/smart-upload/[batchId]/route.ts @/src/app/api/music/smart-upload/[batchId]/approve/route.ts @/src/app/api/music/smart-upload/[batchId]/cancel/route.ts @/src/app/api/music/smart-upload/[batchId]/upload/route.ts @/src/components/admin/sidebar.tsx @/src/components/admin/music/smart-upload/part-mapping-editor.tsx @/src/components/admin/music/smart-upload/smart-upload-dropzone.tsx @/src/components/admin/music/smart-upload/smart-upload-progress.tsx @/src/components/admin/music/smart-upload/smart-upload-review-form.tsx @/src/hooks/use-smart-upload.ts @/src/lib/env.ts @/src/lib/utils.ts @/src/lib/ai/index.ts @/src/lib/ai/provider-registry.ts @/src/lib/ai/structured-output.ts @/src/lib/ai/types.ts @/src/lib/ai/__tests__/provider-registry.test.ts @/src/lib/ai/__tests__/structured-output.test.ts @/src/lib/ai/prompts/music-metadata.ts @/src/lib/ai/prompts/part-classification.ts @/src/lib/ai/providers/anthropic.ts @/src/lib/ai/providers/custom.ts @/src/lib/ai/providers/gemini.ts @/src/lib/ai/providers/kilo.ts @/src/lib/ai/providers/openai-compatible.ts @/src/lib/ai/providers/openai.ts @/src/lib/ai/providers/openrouter.ts @/src/lib/auth/permission-constants.ts @/src/lib/jobs/definitions.ts @/src/lib/jobs/queue.ts @/src/lib/services/music.service.ts @/src/lib/services/smart-upload/content-hash.ts @/src/lib/services/smart-upload/instrument-mapper.ts @/src/lib/services/smart-upload/pdf-splitter.ts @/src/lib/services/smart-upload/smart-upload.service.ts @/src/lib/services/smart-upload/smart-upload.types.ts @/src/lib/services/smart-upload/text-extraction.ts @/src/lib/services/smart-upload/validators.ts @/src/lib/services/smart-upload/__tests__/instrument-mapper.test.ts @/src/lib/services/smart-upload/__tests__/smart-upload.service.test.ts @/src/lib/services/smart-upload/__tests__/validators.test.ts @/src/lib/setup/env-manager.ts @/src/workers/index.ts @/src/workers/smart-upload-worker.ts @/src/workers/__tests__/smart-upload-worker.test.ts 