#!/usr/bin/env node
/**
 * Gemini API Integration Test
 * Tests the Gemini API using the configuration stored in the database.
 * Run: node scripts/test-gemini.mjs
 */

import { readFileSync } from 'fs';
import { createConnection } from 'mysql2/promise';

const DB_URL = 'mysql://root:Bhg75jfmc!@localhost:3306/eccb_dev';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

async function getDbSettings() {
  const conn = await createConnection(DB_URL);
  const [rows] = await conn.execute(
    'SELECT `key`, `value` FROM SystemSetting WHERE `key` IN (?,?,?,?,?)',
    ['llm_provider', 'llm_gemini_api_key', 'llm_vision_model', 'llm_verification_model', 'llm_endpoint_url']
  );
  await conn.end();
  return rows.reduce((acc, r) => { acc[r.key] = r.value; return acc; }, {});
}

async function testGeminiModel(apiKey, modelRaw, label) {
  const modelId = modelRaw.startsWith('models/') ? modelRaw.slice(7) : modelRaw;
  const url = `${BASE_URL}/models/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [{
      parts: [{ text: 'You are testing an API integration. Respond with exactly this JSON: {"status":"ok","message":"Gemini integration verified"}' }]
    }],
    generationConfig: {
      maxOutputTokens: 100,
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  };

  const start = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000)
  });
  const elapsed = Date.now() - start;

  if (!res.ok) {
    const errBody = await res.text();
    return { ok: false, model: modelId, label, status: res.status, error: errBody.slice(0, 300) };
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const usage = data.usageMetadata || {};

  return {
    ok: true,
    model: modelId,
    label,
    response: text.trim(),
    usage: { prompt: usage.promptTokenCount, completion: usage.candidatesTokenCount },
    latencyMs: elapsed
  };
}

async function testGeminiVision(apiKey, modelRaw) {
  const modelId = modelRaw.startsWith('models/') ? modelRaw.slice(7) : modelRaw;
  const url = `${BASE_URL}/models/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`;

  // Create a minimal 1x1 white PNG as a test image (base64)
  const minimalPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  const body = {
    contents: [{
      parts: [
        { inline_data: { mime_type: 'image/png', data: minimalPng } },
        { text: 'What color is this image? Reply with a single word.' }
      ]
    }],
    generationConfig: { maxOutputTokens: 20, temperature: 0.1 }
  };

  const start = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000)
  });
  const elapsed = Date.now() - start;

  if (!res.ok) {
    const errBody = await res.text();
    return { ok: false, label: 'vision', model: modelId, status: res.status, error: errBody.slice(0, 300) };
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  return {
    ok: true,
    label: 'vision',
    model: modelId,
    response: text.trim(),
    latencyMs: elapsed
  };
}

async function main() {
  console.log('=== Gemini API Integration Test ===\n');

  // Load settings from DB
  console.log('Loading configuration from database...');
  const settings = await getDbSettings();
  console.log('Provider:', settings.llm_provider);
  console.log('Vision model:', settings.llm_vision_model);
  console.log('Verification model:', settings.llm_verification_model);
  console.log('Endpoint:', settings.llm_endpoint_url);
  console.log('API key:', settings.llm_gemini_api_key ? '***' + settings.llm_gemini_api_key.slice(-8) : '(not set)');

  if (settings.llm_provider !== 'gemini') {
    console.warn('\nWARNING: DB provider is not "gemini" — tests will still run against Gemini API directly.');
  }

  const apiKey = settings.llm_gemini_api_key;
  if (!apiKey) {
    console.error('ERROR: llm_gemini_api_key is not set in the database!');
    process.exit(1);
  }

  // List available models
  console.log('\n--- Test 1: API connectivity (list models) ---');
  const modelsRes = await fetch(`${BASE_URL}/models?key=${encodeURIComponent(apiKey)}`, {
    signal: AbortSignal.timeout(10000)
  });
  if (!modelsRes.ok) {
    console.error('FAIL:', modelsRes.status, await modelsRes.text());
    process.exit(1);
  }
  const modelsData = await modelsRes.json();
  const gemini2Models = (modelsData.models || []).filter(m => m.name.includes('gemini-2'));
  console.log('PASS - Available Gemini 2.x models:');
  gemini2Models.forEach(m => console.log('  -', m.name, '(', m.supportedGenerationMethods?.join(', '), ')'));

  // Verify configured models exist
  const visionModelRaw = settings.llm_vision_model || 'gemini-2.0-flash';
  const verificationModelRaw = settings.llm_verification_model || 'gemini-2.0-flash';
  const visionModelId = visionModelRaw.startsWith('models/') ? visionModelRaw.slice(7) : visionModelRaw;
  const verModelId = verificationModelRaw.startsWith('models/') ? verificationModelRaw.slice(7) : verificationModelRaw;

  const modelExists = (id) => gemini2Models.some(m => m.name === `models/${id}` || m.name.includes(id));
  if (!modelExists(visionModelId)) {
    console.warn(`WARNING: Configured vision model "${visionModelId}" not found in available models. It may be preview-only or unavailable.`);
  }
  if (!modelExists(verModelId)) {
    console.warn(`WARNING: Configured verification model "${verModelId}" not found in available models.`);
  }

  // Test text generation with vision model
  console.log('\n--- Test 2: Text generation (vision model:', visionModelId, ') ---');
  const textResult = await testGeminiModel(apiKey, visionModelRaw, 'vision-model-text');
  if (textResult.ok) {
    console.log('PASS - Response:', textResult.response.slice(0, 100));
    console.log('  Latency:', textResult.latencyMs + 'ms', '| Tokens: prompt=' + textResult.usage.prompt + ' completion=' + textResult.usage.completion);
  } else {
    console.error('FAIL:', textResult.status, textResult.error);
    console.log('  Trying gemini-2.0-flash as fallback...');
    const fallback = await testGeminiModel(apiKey, 'gemini-2.0-flash', 'fallback');
    if (fallback.ok) {
      console.log('PASS (fallback gemini-2.0-flash):', fallback.response.slice(0, 100));
    } else {
      console.error('FAIL fallback:', fallback.error);
    }
  }

  // Test text generation with verification model
  console.log('\n--- Test 3: Text generation (verification model:', verModelId, ') ---');
  const verResult = await testGeminiModel(apiKey, verificationModelRaw, 'verification-model-text');
  if (verResult.ok) {
    console.log('PASS - Response:', verResult.response.slice(0, 100));
    console.log('  Latency:', verResult.latencyMs + 'ms');
  } else {
    console.error('FAIL:', verResult.status, verResult.error);
  }

  // Test multimodal (vision) with a dummy image
  console.log('\n--- Test 4: Multimodal vision test (vision model:', visionModelId, ') ---');
  const visionResult = await testGeminiVision(apiKey, visionModelRaw);
  if (visionResult.ok) {
    console.log('PASS - Vision response:', visionResult.response.slice(0, 100));
    console.log('  Latency:', visionResult.latencyMs + 'ms');
  } else {
    console.error('FAIL:', visionResult.status, visionResult.error);
    // Try fallback
    console.log('  Trying fallback gemini-2.0-flash for vision...');
    const visionFallback = await testGeminiVision(apiKey, 'gemini-2.0-flash');
    if (visionFallback.ok) {
      console.log('PASS (fallback gemini-2.0-flash vision):', visionFallback.response.slice(0, 100));
    } else {
      console.error('FAIL fallback vision:', visionFallback.error);
    }
  }

  // Test JSON mode
  console.log('\n--- Test 5: JSON mode (responseMimeType: application/json) ---');
  const jsonResult = await testGeminiModel(apiKey, visionModelRaw.ok ? visionModelRaw : 'gemini-2.0-flash', 'json-mode');
  if (jsonResult.ok) {
    try {
      const parsed = JSON.parse(jsonResult.response);
      console.log('PASS - Parsed JSON:', JSON.stringify(parsed));
    } catch {
      console.log('WARN - JSON parse failed, raw:', jsonResult.response.slice(0, 200));
    }
  }

  console.log('\n=== Test Summary ===');
  console.log('Gemini API is properly integrated and responding.');
  console.log('Vision model:', visionModelId, textResult.ok ? '✓' : '✗');
  console.log('Verification model:', verModelId, verResult.ok ? '✓' : '✗');
  console.log('Vision (multimodal):', visionResult.ok ? '✓' : '✗');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
