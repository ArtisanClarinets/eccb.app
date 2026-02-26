# Smart Upload API Configuration Verification Guide

## Overview

The Smart Upload feature uses Large Language Models (LLMs) with vision capabilities to extract metadata from music PDFs. The system was recently updated to have **correct API endpoints for all providers**. This document verifies all configurations are working properly.

## Critical Issues Fixed

### Issue 1: Environment Variable Name Mismatch ✅ FIXED

**Problem**: The `.env` file was using old variable names that don't match what the code expects.

| Old Name | New Name | Usage |
|----------|----------|-------|
| `GEMINI_API_KEY` | `LLM_GEMINI_API_KEY` | Google Gemini API authentication |
| `OPENROUTER_API_KEY` | `LLM_OPENROUTER_API_KEY` | OpenRouter API authentication |
| `AI_PROVIDER` | `LLM_PROVIDER` | Selects which provider to use |
| `AI_MODEL` | `LLM_VISION_MODEL` | Model for first-pass analysis |

**Fix Applied**: Updated `.env` file (lines 176-260) with correct variable names.

### Issue 2: API Endpoint URLs

All providers have **specific, correct endpoints** that must be used:

| Provider | Correct Endpoint | Used For |
|----------|------------------|----------|
| **Gemini** | `https://generativelanguage.googleapis.com/v1beta` | Google's Gemini API |
| **OpenRouter** | `https://openrouter.ai/api/v1` | 200+ models through one API |
| **OpenAI** | `https://api.openai.com/v1` | GPT models |
| **Anthropic** | `https://api.anthropic.com` | Claude models |
| **Ollama** | `http://localhost:11434` | Local models |

These endpoints are **built into the code** in `src/lib/llm/providers.ts` and the adapter files.

### Issue 3: API Key Routing Security

Each provider's adapter uses **only its own API key** to prevent keys from being sent to the wrong provider:

```typescript
// ✅ Correct: Gemini adapter uses only Gemini API key
const apiKey = config.llm_gemini_api_key;
if (!apiKey) throw new Error('Gemini API key required');

// ✅ Correct: OpenRouter adapter uses only OpenRouter API key  
const apiKey = config.llm_openrouter_api_key;
if (!apiKey) throw new Error('OpenRouter API key required');
```

## Current Configuration Status

### Environment Variables (.env file)

```bash
# Provider Selection
LLM_PROVIDER="openrouter"         # ✅ Set to "openrouter"

# API Keys  
LLM_GEMINI_API_KEY="AIza..."      # ✅ Configured
LLM_OPENROUTER_API_KEY="sk-or-..."# ✅ Configured

# Models (use free tiers)
# LLM_VISION_MODEL="..."           # (commented out = uses default)
# LLM_VERIFICATION_MODEL="..."     # (commented out = uses default)
```

### Default Model Selections

When `LLM_VISION_MODEL` and `LLM_VERIFICATION_MODEL` aren't set, the system uses **provider defaults**:

#### OpenRouter (default provider)
- **Vision**: `google/gemini-2.0-flash-exp:free` ← **Free tier!**
- **Verification**: `google/gemma-3-27b-it:free` ← **Free tier!**
- **Endpoint**: `https://openrouter.ai/api/v1` ✅

#### Gemini (backup provider)  
- **Vision**: `gemini-2.0-flash-exp`
- **Verification**: `gemini-2.0-flash-exp`
- **Endpoint**: `https://generativelanguage.googleapis.com/v1beta` ✅

#### OpenAI
- **Vision**: `gpt-4o` (paid)
- **Verification**: `gpt-4o-mini` (paid)
- **Endpoint**: `https://api.openai.com/v1` ✅

#### Anthropic  
- **Vision**: `claude-3-5-sonnet-20241022` (paid)
- **Verification**: `claude-3-haiku-20240307` (paid)
- **Endpoint**: `https://api.anthropic.com` ✅

## Workflow: Upload vs Testing

### Test Endpoint (`POST /api/admin/uploads/settings/test`)
**What it does**:
- ✅ Tests basic connectivity to the API endpoint
- ✅ Checks that the API accepts the provided credentials
- ⚠️ Does NOT actually call the vision model
- Uses simple endpoint like `/models` or `/api/tags` to verify connectivity

**Example**:
```bash
curl -X POST http://localhost:3025/api/admin/uploads/settings/test \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openrouter",
    "apiKey": "sk-or-...",
    "model": "google/gemini-2.0-flash-exp:free"
  }'
# Returns: { ok: true, message: "Successfully connected to openrouter..." }
```

### Actual Upload (`POST /api/files/smart-upload`)
**What it does**:
1. ✅ Accepts PDF file upload
2. ✅ Validates file format (magic bytes)
3. ✅ Stores file to blob storage
4. ⏳ **Queues background job** for LLM analysis
5. 🔄 Returns immediately with session ID
6. 📋 Background worker processes in 3-4 steps:
   - Renders PDF pages to images
   - **Calls actual vision LLM** ← This is where issues happen!
   - Parses extracted metadata
   - Optionally queues second-pass verification

**Why Testing Works But Upload Fails**:
- Test endpoint only checks connectivity → Usually succeeds
- Upload worker actually calls the vision model → Requires **correct config loaded from database**

## Configuration Loading Order

The system loads LLM config in this order:

```
1. Database SystemSettings (loaded first)
   ↓
2. Environment variables (used as fallback)
   ↓
3. Provider defaults (hardcoded as last resort)
```

**Problem**: If database has stale/incorrect values, they take precedence over `.env` values!

## How to Verify Everything is Correct

### Step 1: Verify Environment Variables

```bash
cd /home/dylan/eccb.app
grep "^LLM_" .env | grep -v "^#"
```

Expected output:
```
LLM_PROVIDER=openrouter
LLM_GEMINI_API_KEY=AIza...
LLM_OPENROUTER_API_KEY=sk-or-...
```

### Step 2: Verify Database Configuration

The database **must be updated** from `.env` values. This happens when:
- ✅ The seed script runs on first setup
- ✅ Manually updating database (see below)

To check what's in the database (via admin UI):
1. Log in as admin
2. Go to: Settings → Smart Upload (if available)
3. Look for "LLM Provider" setting
4. Should show: `openrouter`

### Step 3: Verify API Endpoints in Code

All endpoints are hardcoded in `src/lib/llm/providers.ts`:

```bash
grep "defaultEndpoint" /home/dylan/eccb.app/src/lib/llm/providers.ts
```

Should show:
```
https://generativelanguage.googleapis.com/v1beta  (Gemini)
https://openrouter.ai/api/v1                       (OpenRouter)
https://api.openai.com/v1                          (OpenAI)
https://api.anthropic.com                          (Anthropic)
```

### Step 4: Test Vision Model Call (Advanced)

Create `/tmp/test-vision.js` to test the actual vision call:

```javascript
const apiKey = "sk-or-v1-a97b247edeaf9669..."; // Your OpenRouter key
const baseUrl = "https://openrouter.ai/api/v1";

const body = {
  model: "google/gemini-2.0-flash-exp:free",
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "Say 'it works'" }
      ]
    }
  ]
};

fetch(baseUrl + "/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`
  },
  body: JSON.stringify(body)
})
.then(r => r.json())
.then(d => console.log(JSON.stringify(d, null, 2)))
.catch(e => console.error(e));
```

Then run:
```bash
node /tmp/test-vision.js
```

Expected: Should return a proper response with the model's answer.

## Proper Setup Steps

### Step 1: Update .env File ✅ DONE

Done! The `.env` file has been updated with correct variable names.

### Step 2: Reseed the Database

Run the seed script to update database with values from `.env`:

```bash
cd /home/dylan/eccb.app

# Option A: Full seed (recreates all data - only for dev!)
npm run db:seed

# Option B: Manual update script (preserves existing data)
npx tsx scripts/update-llm-config.ts
```

### Step 3: Restart Development Server

Kill and restart the dev server to clear any cached config:

```bash
# Kill running server
pkill -f "node.*next"
pkill -f "next dev"

# Restart
cd /home/dylan/eccb.app
npm run dev -- --port 3025
```

### Step 4: Test the Configuration

1. **Test connectivity** (admin UI):
   - Go to Settings → Smart Upload → Click "Test Connection"
   - Should see: ✅ "Successfully connected"

2. **Test actual upload**:
   - Go to Upload → Select a PDF
   - Upload should complete without errors
   - Check the background jobs to see if processing succeeds

## Troubleshooting Checklist

### Upload shows error "API key required"
- [ ] Check `LLM_PROVIDER` is set correctly in `.env`
- [ ] Check corresponding `LLM_{PROVIDER}_API_KEY` is set in `.env`
- [ ] Re-run database seed: `npx tsx scripts/update-llm-config.ts`
- [ ] Restart dev server

### Upload shows "Failed to call LLM" after timeout
- [ ] Check internet connection to the API endpoint
- [ ] Check API key is valid (test via curl)
- [ ] Check API endpoint URL is correct for the provider
- [ ] Verify model name is valid for the provider

### Upload works but metadata looks wrong
- [ ] Try the secondary verification pass (should improve accuracy)
- [ ] Check if using free tier models (may have limitations)
- [ ] Try switching to a better model in `.env`'s `LLM_VISION_MODEL`

### Test passes but upload fails
- [ ] Test endpoint only checks connectivity, not actual vision call
- [ ] Database config may be stale - run seed script
- [ ] Check server logs: `npm run dev` shows detailed error messages
- [ ] Try restarting dev server after updating `.env`

## File Locations Reference

| File | Purpose |
|------|---------|
| `.env` | Environment variables (API keys, provider choice) |
| `src/lib/llm/providers.ts` | Endpoint URLs and default models (hardcoded) |
| `src/lib/llm/config-loader.ts` | Loads config from database (priority) then env vars |
| `src/lib/llm/gemini.ts` | Gemini adapter with correct endpoint and request format |
| `src/lib/llm/openrouter.ts` | OpenRouter adapter with correct endpoint |
| `src/lib/llm/openai.ts` | OpenAI adapter (used by Ollama/custom servers too) |
| `src/lib/llm/anthropic.ts` | Anthropic adapter with correct endpoint |
| `src/workers/smart-upload-processor.ts` | Main background job that calls LLM |
| `prisma/seed.ts` | Seeds database with config from environment variables |
| `src/app/api/admin/uploads/settings/route.ts` | Admin API for getting/setting configurations |
| `src/app/api/admin/uploads/settings/test/route.ts` | Test endpoint for checking connectivity |

## Summary

**What Changed**:
1. ✅ Updated `.env` file with correct variable names (`LLM_*` instead of `AI_*` or provider-specific names)
2. ✅ Verified all API endpoints are correct in code
3. ✅ Verified each provider uses only its own API key
4. ✅ Created helper script for database updates

**What You Need to Do**:
1. Run: `npx tsx scripts/update-llm-config.ts` (to update database)
2. Restart dev server: `npm run dev -- --port 3025`
3. Test upload again - should now work!

If issues persist, check the server logs in the terminal where you ran `npm run dev` for detailed error messages about which step is failing.
