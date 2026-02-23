import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/guards';
import { checkUserPermission } from '@/lib/auth/permissions';
import { logger } from '@/lib/logger';
import { SYSTEM_CONFIG } from '@/lib/auth/permission-constants';

// =============================================================================
// Types
// =============================================================================

type Provider = 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'custom';

interface ModelInfo {
  id: string;
  name: string;
  isVision: boolean;
  pricePerToken: number | null;
  priceDisplay: string;
  providerNote?: string;
}

interface ModelsResponse {
  models: ModelInfo[];
  totalCount: number;
  filteredForVision: boolean;
  warning?: string;
}

// =============================================================================
// Hard-coded Price Tables
// =============================================================================

const OPENAI_PRICES: Record<string, number> = {
  'gpt-4o-mini': 0.00000015,
  'gpt-4o': 0.0000025,
  'gpt-4-turbo': 0.00001,
  'gpt-4-vision-preview': 0.00001,
};

const GEMINI_PRICES: Record<string, number> = {
  'gemini-2.0-flash': 0.00000010,
  'gemini-2.5-flash-preview': 0.00000015,
  'gemini-1.5-flash': 0.00000035,
  'gemini-2.5-pro-preview': 0.00000125,
  'gemini-1.5-pro': 0.00000175,
};

// =============================================================================
// Vision Model Keywords
// =============================================================================

const OLLAMA_VISION_KEYWORDS = [
  'vision', 'vl', 'llava', 'bakllava', 'moondream', 'cogvlm',
  'minicpm-v', 'qwen2-vl', 'qwen2.5-vl', 'gemma3', 'llama3.2-vision',
  'mistral', 'phi3-vision', 'internvl', 'pixtral',
];

const OPENAI_VISION_KEYWORDS = ['gpt-4o', 'gpt-4-turbo', 'gpt-4-vision'];

// =============================================================================
// Helper Functions
// =============================================================================

function formatPrice(pricePerToken: number | null): string {
  if (pricePerToken === null || pricePerToken === 0) {
    return 'Free';
  }
  const pricePer1K = pricePerToken * 1000;
  return `$${pricePer1K.toFixed(5)} / 1K tokens`;
}

function getProviderNote(modelId: string, provider: Provider): string | undefined {
  if (provider === 'gemini') {
    if (modelId === 'gemini-1.5-pro' || modelId === 'gemini-2.5-pro-preview') {
      return 'Rate limit: 2 RPM (free tier) / 1,000 RPM (paid)';
    }
    if (modelId === 'gemini-2.0-flash' || modelId === 'gemini-2.5-flash-preview') {
      return 'Rate limit: 15 RPM (free tier) / 4,000 RPM (paid)';
    }
  }
  if (provider === 'openai') {
    return 'Rate limit: 500 RPM (Tier 1)';
  }
  return undefined;
}

function isVisionModel(
  modelName: string,
  provider: Provider,
  keywords: string[]
): boolean {
  const lowerName = modelName.toLowerCase();
  return keywords.some((keyword) => lowerName.includes(keyword));
}

function sortModelsByPrice(models: ModelInfo[]): ModelInfo[] {
  return [...models].sort((a, b) => {
    if (a.pricePerToken === null && b.pricePerToken === null) {
      return a.id.localeCompare(b.id);
    }
    if (a.pricePerToken === null) return -1;
    if (b.pricePerToken === null) return 1;
    if (a.pricePerToken === 0 && b.pricePerToken === 0) {
      return a.id.localeCompare(b.id);
    }
    if (a.pricePerToken === 0) return -1;
    if (b.pricePerToken === 0) return 1;
    return a.pricePerToken - b.pricePerToken;
  });
}

// =============================================================================
// Provider API Calls
// =============================================================================

async function fetchOllamaModels(endpoint: string): Promise<ModelInfo[]> {
  const response = await fetch(`${endpoint}/api/tags`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const models: ModelInfo[] = (data.models || []).map((model: { name: string }) => {
    const isVision = isVisionModel(model.name, 'ollama', OLLAMA_VISION_KEYWORDS);
    return {
      id: model.name,
      name: model.name,
      isVision,
      pricePerToken: null,
      priceDisplay: 'Unknown',
    };
  });

  return models;
}

async function fetchOpenAIModels(apiKey: string): Promise<ModelInfo[]> {
  const response = await fetch('https://api.openai.com/v1/models', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const models: ModelInfo[] = (data.data || []).map((model: { id: string }) => {
    const isVision = isVisionModel(model.id, 'openai', OPENAI_VISION_KEYWORDS);
    const pricePerToken = OPENAI_PRICES[model.id] ?? null;
    return {
      id: model.id,
      name: model.id,
      isVision,
      pricePerToken,
      priceDisplay: formatPrice(pricePerToken),
      providerNote: getProviderNote(model.id, 'openai'),
    };
  });

  return models;
}

function fetchAnthropicModels(): ModelInfo[] {
  // Anthropic has no public list-models endpoint
  const models = [
    'claude-opus-4-5',
    'claude-sonnet-4-5',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
    'claude-3-haiku-20240307',
  ];

  return models.map((id) => ({
    id,
    name: id,
    isVision: true,
    pricePerToken: null,
    priceDisplay: 'Unknown',
  }));
}

async function fetchGeminiModels(apiKey: string): Promise<ModelInfo[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const models: ModelInfo[] = (data.models || []).filter((model: { name: string; supportedGenerationMethods?: string[] }) => {
    // Must support generateContent (not just embeddings)
    if (!model.supportedGenerationMethods?.includes('generateContent')) {
      return false;
    }
    // Exclude embed and aqa models
    const name = model.name.toLowerCase();
    return !name.includes('embed') && !name.includes('aqa');
  }).map((model: { name: string }) => {
    const modelId = model.name;
    const isVision = true; // All Gemini models with generateContent support vision
    const pricePerToken = GEMINI_PRICES[modelId] ?? null;
    return {
      id: modelId,
      name: modelId,
      isVision,
      pricePerToken,
      priceDisplay: formatPrice(pricePerToken),
      providerNote: getProviderNote(modelId, 'gemini'),
    };
  });

  return models;
}

async function fetchOpenRouterModels(apiKey: string): Promise<ModelInfo[]> {
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const models: ModelInfo[] = (data.data || []).map((model: {
    id: string;
    architecture?: { modality?: string };
    pricing?: { prompt?: number | null };
  }) => {
    const modality = model.architecture?.modality;
    const isVision = modality === 'text+image->text' || model.id.toLowerCase().includes('vision') || model.id.toLowerCase().includes('vl');
    const pricePerToken = model.pricing?.prompt ?? null;
    
    let providerNote: string | undefined;
    if (pricePerToken === 0 || pricePerToken === null) {
      providerNote = 'Rate limit: 20 RPM (free tier)';
    }

    return {
      id: model.id,
      name: model.id,
      isVision,
      pricePerToken,
      priceDisplay: formatPrice(pricePerToken),
      providerNote,
    };
  });

  return models;
}

async function fetchCustomModels(endpoint: string, apiKey?: string): Promise<ModelInfo[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${endpoint}/models`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Custom API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  // Assume array of model objects with id/name fields, or object with models array
  const modelArray = Array.isArray(data) ? data : (data.models || []);

  const models: ModelInfo[] = modelArray.map((model: { id?: string; name?: string }) => {
    const id = model.id ?? model.name ?? 'unknown';
    return {
      id,
      name: model.name ?? id,
      isVision: false, // Custom provider - no filtering
      pricePerToken: null,
      priceDisplay: 'Unknown',
    };
  });

  return models;
}

// =============================================================================
// Main Handler
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    // Authentication and authorization
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasPermission = await checkUserPermission(session.user.id, SYSTEM_CONFIG);
    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider') as Provider | null;
    const apiKey = searchParams.get('apiKey') || undefined;
    const endpoint = searchParams.get('endpoint') || undefined;

    // Validate required parameters
    if (!provider) {
      return NextResponse.json(
        { error: 'Missing required parameter: provider' },
        { status: 400 }
      );
    }

    const validProviders: Provider[] = ['ollama', 'openai', 'anthropic', 'gemini', 'openrouter', 'custom'];
    if (!validProviders.includes(provider)) {
      return NextResponse.json(
        { error: `Invalid provider: ${provider}. Must be one of: ${validProviders.join(', ')}` },
        { status: 400 }
      );
    }

    // Fetch models based on provider
    let models: ModelInfo[];
    let filteredForVision = false;
    let warning: string | undefined;

    switch (provider) {
      case 'ollama': {
        if (!endpoint) {
          return NextResponse.json(
            { error: 'Missing required parameter: endpoint for ollama provider' },
            { status: 400 }
          );
        }
        models = await fetchOllamaModels(endpoint);
        
        // Filter for vision models
        const visionModels = models.filter((m) => m.isVision);
        if (visionModels.length > 0) {
          models = visionModels;
          filteredForVision = true;
        } else {
          warning = 'WARN: Unable to filter by vision capability';
        }
        break;
      }

      case 'openai': {
        if (!apiKey) {
          return NextResponse.json(
            { error: 'Missing required parameter: apiKey for openai provider' },
            { status: 400 }
          );
        }
        models = await fetchOpenAIModels(apiKey);
        
        // Filter for vision models
        const visionModels = models.filter((m) => m.isVision);
        if (visionModels.length > 0) {
          models = visionModels;
          filteredForVision = true;
        }
        break;
      }

      case 'anthropic': {
        // Anthropic has no public API - return hard-coded list
        models = fetchAnthropicModels();
        filteredForVision = true;
        break;
      }

      case 'gemini': {
        if (!apiKey) {
          return NextResponse.json(
            { error: 'Missing required parameter: apiKey for gemini provider' },
            { status: 400 }
          );
        }
        models = await fetchGeminiModels(apiKey);
        filteredForVision = true;
        break;
      }

      case 'openrouter': {
        if (!apiKey) {
          return NextResponse.json(
            { error: 'Missing required parameter: apiKey for openrouter provider' },
            { status: 400 }
          );
        }
        models = await fetchOpenRouterModels(apiKey);
        
        // Filter for vision models
        const visionModels = models.filter((m) => m.isVision);
        if (visionModels.length > 0) {
          models = visionModels;
          filteredForVision = true;
        }
        break;
      }

      case 'custom': {
        if (!endpoint) {
          return NextResponse.json(
            { error: 'Missing required parameter: endpoint for custom provider' },
            { status: 400 }
          );
        }
        models = await fetchCustomModels(endpoint, apiKey);
        // Custom provider returns all models unfiltered
        break;
      }

      default:
        return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });
    }

    // Sort models by price (cheapest first)
    models = sortModelsByPrice(models);

    const response: ModelsResponse = {
      models,
      totalCount: models.length,
      filteredForVision,
    };

    if (warning) {
      response.warning = warning;
    }

    logger.info('Fetched models from provider', {
      provider,
      modelCount: models.length,
      filteredForVision,
      userId: session.user.id,
    });

    return NextResponse.json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to fetch models from provider', {
      error: errorMessage,
    });

    return NextResponse.json(
      { error: `Failed to fetch models: ${errorMessage}` },
      { status: 502 }
    );
  }
}

// =============================================================================
// OPTIONS
// =============================================================================

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
