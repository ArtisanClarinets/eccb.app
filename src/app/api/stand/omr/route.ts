import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { z } from 'zod';

// Zod schema for OMR request validation
const omrRequestSchema = z.object({
  musicFileId: z.string().min(1, 'musicFileId is required'),
  forceReprocess: z.boolean().optional().default(false),
});

// OMR metadata structure extracted from sheet music
interface OMRMetadata {
  tempo?: number;
  keySignature?: string;
  timeSignature?: string;
  estimatedDuration?: number;
  measureCount?: number;
  pageCount?: number;
  difficulty?: 'GRADE_1' | 'GRADE_2' | 'GRADE_3' | 'GRADE_4' | 'GRADE_5' | 'GRADE_6';
  instruments?: string[];
  notes?: string;
  processedAt: string;
  provider: string;
}

/**
 * POST /api/stand/omr
 * Performs Optical Music Recognition on a PDF file using user's personal LLM/vision API key
 *
 * This endpoint:
 * 1. Validates user authentication
 * 2. Retrieves user's personal API key from preferences
 * 3. Fetches the PDF file from storage
 * 4. Calls the configured AI/vision provider for OMR analysis
 * 5. Stores extracted metadata in MusicFile.extractedMetadata
 *
 * Request body: { musicFileId: string, forceReprocess?: boolean }
 * Response: { success: boolean, metadata?: OMRMetadata, error?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validated = omrRequestSchema.parse(body);

    // Get user preferences to retrieve their personal API key
    const userPrefs = await prisma.userPreferences.findUnique({
      where: { userId: session.user.id },
      select: { otherSettings: true },
    });

    // Check if user has configured their personal API key
    const otherSettings = userPrefs?.otherSettings as Record<string, unknown> | null;
    const omrApiKey = otherSettings?.omrApiKey as string | undefined;
    const omrProvider = (otherSettings?.omrProvider as string) || 'openai';

    if (!omrApiKey) {
      return NextResponse.json(
        {
          error: 'OMR API key not configured',
          code: 'API_KEY_REQUIRED',
          message: 'Please configure your personal LLM/vision API key in settings to use OMR features.',
        },
        { status: 403 }
      );
    }

    // Get the music file
    const musicFile = await prisma.musicFile.findUnique({
      where: { id: validated.musicFileId },
      select: {
        id: true,
        storageKey: true,
        extractedMetadata: true,
        pieceId: true,
      },
    });

    if (!musicFile) {
      return NextResponse.json({ error: 'Music file not found' }, { status: 404 });
    }

    // Check if already processed (unless force reprocess)
    if (musicFile.extractedMetadata && !validated.forceReprocess) {
      return NextResponse.json({
        success: true,
        metadata: JSON.parse(musicFile.extractedMetadata),
        cached: true,
      });
    }

    // Get file URL for processing
    const fileUrl = `/api/files/${musicFile.storageKey}`;

    // Call the appropriate AI provider for OMR
    let metadata: OMRMetadata;

    try {
      metadata = await performOMRAnalysis(fileUrl, omrApiKey, omrProvider);
    } catch (omrError) {
      console.error('OMR analysis failed:', omrError);
      return NextResponse.json(
        {
          error: 'OMR analysis failed',
          message: omrError instanceof Error ? omrError.message : 'Unknown error during analysis',
        },
        { status: 500 }
      );
    }

    // Store the extracted metadata
    await prisma.musicFile.update({
      where: { id: validated.musicFileId },
      data: {
        extractedMetadata: JSON.stringify(metadata),
      },
    });

    // If we have a music piece, also update its metadata
    if (musicFile.pieceId && metadata.tempo) {
      await prisma.musicPiece.update({
        where: { id: musicFile.pieceId },
        data: {
          tempo: String(metadata.tempo),
          ...(metadata.keySignature && { keySignature: metadata.keySignature }),
          ...(metadata.timeSignature && { timeSignature: metadata.timeSignature }),
          ...(metadata.difficulty && { difficulty: metadata.difficulty as never }),
          ...(metadata.estimatedDuration && { duration: Math.round(metadata.estimatedDuration) }),
        },
      });
    }

    return NextResponse.json({
      success: true,
      metadata,
      cached: false,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error in OMR processing:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/stand/omr
 * Returns OMR metadata for a music file if already processed
 * Query params: musicFileId
 */
export async function GET(request: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const musicFileId = searchParams.get('musicFileId');

    if (!musicFileId) {
      return NextResponse.json(
        { error: 'musicFileId query parameter is required' },
        { status: 400 }
      );
    }

    const musicFile = await prisma.musicFile.findUnique({
      where: { id: musicFileId },
      select: {
        id: true,
        extractedMetadata: true,
      },
    });

    if (!musicFile) {
      return NextResponse.json({ error: 'Music file not found' }, { status: 404 });
    }

    if (!musicFile.extractedMetadata) {
      return NextResponse.json({
        processed: false,
        message: 'OMR analysis not yet performed for this file',
      });
    }

    return NextResponse.json({
      processed: true,
      metadata: JSON.parse(musicFile.extractedMetadata),
    });
  } catch (error) {
    console.error('Error fetching OMR metadata:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Perform OMR analysis using the configured AI provider
 */
async function performOMRAnalysis(
  fileUrl: string,
  apiKey: string,
  provider: string
): Promise<OMRMetadata> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const fullUrl = `${baseUrl}${fileUrl}`;

  // Provider-specific analysis
  switch (provider.toLowerCase()) {
    case 'openai':
      return analyzeWithOpenAI(fullUrl, apiKey);
    case 'anthropic':
      return analyzeWithAnthropic(fullUrl, apiKey);
    case 'google':
      return analyzeWithGoogle(fullUrl, apiKey);
    default:
      throw new Error(`Unsupported OMR provider: ${provider}`);
  }
}

/**
 * Analyze sheet music using OpenAI Vision API
 */
async function analyzeWithOpenAI(fileUrl: string, apiKey: string): Promise<OMRMetadata> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert music analyst. Analyze the provided sheet music image and extract musical metadata.
Return a JSON object with the following fields (only include fields you can confidently determine):
- tempo: number (BPM)
- keySignature: string (e.g., "C major", "G major", "F minor")
- timeSignature: string (e.g., "4/4", "3/4", "6/8")
- estimatedDuration: number (seconds)
- measureCount: number
- difficulty: "GRADE_1" | "GRADE_2" | "GRADE_3" | "GRADE_4" | "GRADE_5" | "GRADE_6" (1=easiest, 6=hardest)
- instruments: string[] (list of instruments this part appears to be for)
- notes: string (any additional observations)

Be conservative - only include fields you can determine with high confidence.`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyze this sheet music and extract the musical metadata.',
            },
            {
              type: 'image_url',
              image_url: { url: fileUrl },
            },
          ],
        },
      ],
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  if (!content) {
    throw new Error('No response content from OpenAI');
  }

  const parsed = JSON.parse(content);
  return {
    ...parsed,
    processedAt: new Date().toISOString(),
    provider: 'openai',
  };
}

/**
 * Analyze sheet music using Anthropic Claude API
 */
async function analyzeWithAnthropic(fileUrl: string, apiKey: string): Promise<OMRMetadata> {
  // First, fetch the image and convert to base64
  const imageResponse = await fetch(fileUrl);
  const imageBuffer = await imageResponse.arrayBuffer();
  const base64Image = Buffer.from(imageBuffer).toString('base64');
  const mediaType = fileUrl.endsWith('.png') ? 'image/png' : 'image/jpeg';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: `Analyze this sheet music and extract musical metadata. Return a JSON object with these fields (only include what you can confidently determine):
- tempo: number (BPM)
- keySignature: string (e.g., "C major", "G major")
- timeSignature: string (e.g., "4/4", "3/4")
- estimatedDuration: number (seconds)
- measureCount: number
- difficulty: "GRADE_1" | "GRADE_2" | "GRADE_3" | "GRADE_4" | "GRADE_5" | "GRADE_6" (1=easiest, 6=hardest)
- instruments: string[]
- notes: string

Return only valid JSON.`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const content = data.content[0]?.text;

  if (!content) {
    throw new Error('No response content from Anthropic');
  }

  // Parse JSON from the response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in Anthropic response');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    ...parsed,
    processedAt: new Date().toISOString(),
    provider: 'anthropic',
  };
}

/**
 * Analyze sheet music using Google Gemini API
 */
async function analyzeWithGoogle(fileUrl: string, apiKey: string): Promise<OMRMetadata> {
  // Fetch the image and convert to base64
  const imageResponse = await fetch(fileUrl);
  const imageBuffer = await imageResponse.arrayBuffer();
  const base64Image = Buffer.from(imageBuffer).toString('base64');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: base64Image,
                },
              },
              {
                text: `Analyze this sheet music and extract musical metadata. Return a JSON object with these fields (only include what you can confidently determine):
- tempo: number (BPM)
- keySignature: string
- timeSignature: string
- estimatedDuration: number (seconds)
- measureCount: number
- difficulty: "GRADE_1" | "GRADE_2" | "GRADE_3" | "GRADE_4" | "GRADE_5" | "GRADE_6" (1=easiest, 6=hardest)
- instruments: string[]
- notes: string

Return only valid JSON.`,
              },
            ],
          },
        ],
        generationConfig: {
          response_mime_type: 'application/json',
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) {
    throw new Error('No response content from Google');
  }

  const parsed = JSON.parse(content);
  return {
    ...parsed,
    processedAt: new Date().toISOString(),
    provider: 'google',
  };
}
