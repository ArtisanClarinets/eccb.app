# AI Providers

Smart Upload uses AI providers to extract metadata from uploaded files. This document covers all supported providers and how to configure them.

## Overview

The platform supports multiple AI providers through a unified interface. The provider is selected via the `AI_PROVIDER` environment variable, and each provider has its own required configuration.

## Supported Providers

| Provider | ID | Description | API Required |
|----------|-----|-------------|--------------|
| OpenAI | `openai` | GPT-4o models for high-quality extraction | Yes |
| Anthropic | `anthropic` | Claude models for reasoning | Yes |
| Google Gemini | `gemini` | Gemini Flash for fast, cheap extraction | Yes |
| OpenRouter | `openrouter` | Aggregator with access to many models | Yes |
| OpenAI Compatible | `openai_compat` | Local/self-hosted models (Ollama, vLLM, etc.) | Optional |
| Kilo | `kilo` | Built-in provider (uses OpenAI or custom) | Optional |
| Custom | `custom` | Any OpenAI-compatible API | Optional |

## Global Configuration

These environment variables apply to all providers:

```bash
# Required: Select AI provider
AI_PROVIDER=openai

# Optional: Override default model
# Defaults: openai=gpt-4o-mini, anthropic=claude-3-haiku, gemini=gemini-1.5-flash
AI_MODEL=gpt-4o-mini

# Optional: AI temperature (0.0-2.0, default: 0.1)
# Lower values = more deterministic, higher = more creative
AI_TEMPERATURE=0.1
```

## Provider Configuration

### OpenAI

OpenAI's GPT models offer excellent performance for metadata extraction with good reasoning capabilities.

#### Environment Variables

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-your-api-key-here
```

#### Getting an API Key

1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign up or log in
3. Navigate to API Keys
4. Create a new secret key
5. Add credits to your account (pay-as-you-go)

#### Recommended Models

| Model | Use Case | Speed | Quality |
|-------|----------|-------|---------|
| `gpt-4o-mini` | Default, best value | Fast | Good |
| `gpt-4o` | Complex extraction | Medium | Excellent |
| `gpt-4o-realtime` | Streaming | Fast | Good |

#### Example `.env` Configuration

```bash
# OpenAI Configuration
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
AI_TEMPERATURE=0.1
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

### Anthropic

Anthropic's Claude models excel at reasoning and can handle complex metadata extraction tasks.

#### Environment Variables

```bash
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-your-api-key-here
```

#### Getting an API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up or log in
3. Navigate to API Keys
4. Create a new API key

#### Recommended Models

| Model | Use Case | Speed | Quality |
|-------|----------|-------|---------|
| `claude-3-haiku` | Default, fast | Very Fast | Good |
| `claude-3-sonnet` | Complex extraction | Medium | Excellent |
| `claude-3-opus` | Best quality | Slow | Best |

#### Example `.env` Configuration

```bash
# Anthropic Configuration
AI_PROVIDER=anthropic
AI_MODEL=claude-3-haiku
AI_TEMPERATURE=0.1
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

### Google Gemini

Google's Gemini models provide fast, cost-effective extraction with excellent multilingual support.

#### Environment Variables

```bash
AI_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-api-key
```

#### Getting an API Key

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Sign in with your Google account
3. Navigate to API Keys
4. Create a new API key

#### Recommended Models

| Model | Use Case | Speed | Quality |
|-------|----------|-------|---------|
| `gemini-1.5-flash` | Default, fast | Very Fast | Good |
| `gemini-1.5-pro` | Complex extraction | Medium | Excellent |

#### Example `.env` Configuration

```bash
# Google Gemini Configuration
AI_PROVIDER=gemini
AI_MODEL=gemini-1.5-flash
AI_TEMPERATURE=0.1
GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

### OpenRouter

OpenRouter aggregates multiple AI providers through a single API, offering access to many models at competitive prices.

#### Environment Variables

```bash
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-your-api-key-here
```

#### Getting an API Key

1. Go to [openrouter.ai](https://openrouter.ai)
2. Sign up or log in
3. Navigate to API Keys
4. Create a new key

#### Recommended Models

| Model | Use Case | Speed | Quality |
|-------|----------|-------|---------|
| `openai/gpt-4o-mini` | Default | Fast | Good |
| `anthropic/claude-3-haiku` | Fast, good reasoning | Very Fast | Good |
| `google/gemini-pro-1.5` | Excellent quality | Medium | Excellent |

#### Example `.env` Configuration

```bash
# OpenRouter Configuration
AI_PROVIDER=openrouter
AI_MODEL=openai/gpt-4o-mini
AI_TEMPERATURE=0.1
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

### OpenAI-Compatible (Local/Self-Hosted)

Use any OpenAI-compatible API endpoint, including local models like Ollama, LM Studio, or vLLM.

#### Environment Variables

```bash
AI_PROVIDER=openai_compat
OPENAI_COMPAT_BASE_URL=http://localhost:11434/v1
# Optional: API key (not required for most local models)
OPENAI_COMPAT_API_KEY=
```

#### Setting Up Ollama (Local)

1. Install Ollama: [ollama.ai](https://ollama.ai)
2. Start the Ollama server:
   ```bash
   ollama serve
   ```
3. Pull a model:
   ```bash
   ollama pull llama3.2
   ```
4. Verify the API is running at `http://localhost:11434/v1`

#### Setting Up LM Studio

1. Download LM Studio: [lmstudio.ai](https://lmstudio.ai)
2. Open the app and download a model
3. Start the local server (click "Start Server" in the AI Chat tab)
4. Note the server URL (typically `http://localhost:1234/v1`)

#### Setting Up vLLM

1. Install vLLM: [vllm.ai](https://docs.vllm.ai/)
2. Start the server:
   ```bash
   vllm serve <model-name> --host 0.0.0.0 --port 8000
   ```
3. The API will be available at `http://localhost:8000/v1`

#### Example `.env` Configuration (Ollama)

```bash
# OpenAI-Compatible Configuration (Ollama)
AI_PROVIDER=openai_compat
AI_MODEL=llama3.2
AI_TEMPERATURE=0.1
OPENAI_COMPAT_BASE_URL=http://localhost:11434/v1
# Leave empty for local models without authentication
OPENAI_COMPAT_API_KEY=
```

#### Example `.env` Configuration (LM Studio)

```bash
# OpenAI-Compatible Configuration (LM Studio)
AI_PROVIDER=openai_compat
AI_MODEL=llama-3.2-1b-instruct-q4_k_m
AI_TEMPERATURE=0.1
OPENAI_COMPAT_BASE_URL=http://localhost:1234/v1
OPENAI_COMPAT_API_KEY=
```

---

### Kilo (Built-in)

Kilo is a built-in provider that can use either a custom endpoint or fall back to OpenAI. It's designed for flexibility and easy setup.

#### Environment Variables

```bash
AI_PROVIDER=kilo
# Option 1: Use Kilo's service (if available)
KILO_API_KEY=your-kilo-key

# Option 2: Fall back to OpenAI
OPENAI_API_KEY=sk-your-openai-key
```

#### How It Works

- If `KILO_API_KEY` is set, Kilo uses its own endpoints
- Otherwise, it falls back to `OPENAI_API_KEY`
- This allows for easy switching without code changes

#### Example `.env` Configuration

```bash
# Kilo Configuration (using OpenAI fallback)
AI_PROVIDER=kilo
AI_MODEL=gpt-4o-mini
AI_TEMPERATURE=0.1
OPENAI_API_KEY=sk-your-api-key-here
```

---

### Custom (Escape Hatch)

Use any OpenAI-compatible API endpoint. This is a catch-all for providers not explicitly supported.

#### Environment Variables

```bash
AI_PROVIDER=custom
CUSTOM_AI_BASE_URL=https://your-api.example.com/v1
# Optional: Custom headers as JSON
CUSTOM_AI_HEADERS_JSON='{"Authorization": "Bearer your-token", "X-Custom-Header": "value"}'
```

#### Example `.env` Configuration

```bash
# Custom Provider Configuration
AI_PROVIDER=custom
AI_MODEL=your-model-name
AI_TEMPERATURE=0.1
CUSTOM_AI_BASE_URL=https://api.example.com/v1
CUSTOM_AI_HEADERS_JSON='{"Authorization": "Bearer xxxxxx"}'
```

---

## Provider Selection

### Automatic Selection

The system automatically detects which providers are configured:

```bash
# Check which providers are available
npm run script:check-ai-providers
```

This will show which providers have valid API keys configured.

### Fallback Behavior

If the configured provider fails:

1. The system logs the error
2. Processing retries with exponential backoff (up to 3 retries)
3. If all retries fail, the item is marked as failed
4. You can manually retry later after fixing the issue

### Switching Providers

To switch providers:

1. Update `AI_PROVIDER` in `.env`
2. Add the new provider's API key
3. Restart the server
4. Test with a small upload

## Troubleshooting

### Missing API Key Error

**Symptom**: `MissingAPIKeyError: OPENAI_API_KEY is required for openai provider`

**Solution**: Ensure the correct API key environment variable is set for your provider. Check the configuration section for your provider above.

### Rate Limit Errors

**Symptom**: `Rate limit exceeded` or `429 Too Many Requests`

**Solution**:
- Wait before retrying (rate limits reset)
- Consider using a faster/cheaper model
- For local models, ensure the server can handle requests

### Connection Errors

**Symptom**: `ECONNREFUSED` or `ENOTFOUND`

**Solution**:
- For local providers (Ollama, LM Studio), ensure the server is running
- Check the `OPENAI_COMPAT_BASE_URL` is correct
- Verify firewall settings allow connections

### Invalid API Key

**Symptom**: `401 Unauthorized` or `Invalid API key`

**Solution**:
- Verify the API key is correct
- Check for extra spaces or characters
- Regenerate the API key if compromised

### Model Not Found

**Symptom**: `model not found` or `Unknown model`

**Solution**:
- Verify the model name is correct
- Check if the model is available in your region
- For local models, ensure it's downloaded and running

### Timeout Errors

**Symptom**: `Request timed out`

**Solution**:
- For complex extractions, the default timeout may be too short
- Try a faster model
- For local models, ensure adequate system resources

## Performance Comparison

| Provider | Model | Speed | Cost | Quality |
|----------|-------|-------|------|---------|
| OpenAI | gpt-4o-mini | Fast | $ | Good |
| OpenAI | gpt-4o | Medium | $$ | Excellent |
| Anthropic | claude-3-haiku | Very Fast | $ | Good |
| Anthropic | claude-3-sonnet | Medium | $$ | Excellent |
| Gemini | flash | Very Fast | $ | Good |
| Gemini | pro | Medium | $$ | Excellent |
| Local (Ollama) | llama3.2 | Varies | Free* | Good |

*Local models require hardware resources but have no API costs.

## Security Considerations

### API Key Protection

- Never commit API keys to version control
- Use environment variables, not hardcoded values
- Rotate keys periodically
- Use minimal permissions where possible

### Local Model Security

When using local models:

- Ensure the server is not exposed to the internet
- Use firewall rules to restrict access
- Keep models and software updated

## Related Documentation

- [SMART_UPLOAD.md](./SMART_UPLOAD.md) - Smart Upload feature documentation
- [env.example](../env.example) - Environment variable reference