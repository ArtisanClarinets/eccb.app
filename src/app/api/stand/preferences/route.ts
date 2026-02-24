import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { z } from 'zod';

// Zod schemas for validation
const preferencesUpdateSchema = z.object({
  nightMode: z.boolean().optional(),
  metronomeSettings: z.record(z.string(), z.any()).optional(),
  tunerSettings: z.record(z.string(), z.any()).optional(),
  pitchPipeSettings: z.record(z.string(), z.any()).optional(),
  midiMappings: z.record(z.string(), z.any()).optional(),
  audioTrackerSettings: z
    .object({
      enabled: z.boolean().optional(),
      sensitivity: z.number().min(0).max(1).optional(),
      cooldownMs: z.number().min(0).optional(),
    })
    .optional(),
  otherSettings: z.record(z.string(), z.any()).optional(),
});

export type PreferencesUpdateInput = z.infer<typeof preferencesUpdateSchema>;

/**
 * GET /api/stand/preferences
 * Returns user preferences for the digital stand
 * Query params: userId (optional, defaults to current user)
 */
export async function GET(request: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    // Users can only view their own preferences
    const targetUserId = userId || session.user.id;
    if (targetUserId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden: Cannot view other users preferences' },
        { status: 403 }
      );
    }

    let preferences = await prisma.userPreferences.findUnique({
      where: { userId: targetUserId },
    });

    // Create default preferences if they don't exist
    if (!preferences) {
      preferences = await prisma.userPreferences.create({
        data: {
          userId: targetUserId,
          nightMode: false,
        },
      });
    }

    return NextResponse.json({ preferences });
  } catch (error) {
    console.error('Error fetching preferences:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/stand/preferences
 * Creates user preferences (or updates if exists)
 * Body: { nightMode?, metronomeSettings?, midiMappings?, otherSettings? }
 */
export async function POST(request: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = preferencesUpdateSchema.parse(body);

    const preferences = await prisma.userPreferences.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        nightMode: validated.nightMode ?? false,
        metronomeSettings: validated.metronomeSettings ?? {},
        midiMappings: validated.midiMappings ?? {},
        otherSettings: {
          ...validated.otherSettings,
          ...(validated.tunerSettings && { tunerSettings: validated.tunerSettings }),
          ...(validated.pitchPipeSettings && { pitchPipeSettings: validated.pitchPipeSettings }),
          ...(validated.audioTrackerSettings && { audioTrackerSettings: validated.audioTrackerSettings }),
        },
      },
      update: {
        ...(validated.nightMode !== undefined && { nightMode: validated.nightMode }),
        ...(validated.metronomeSettings && { metronomeSettings: validated.metronomeSettings }),
        ...(validated.midiMappings && { midiMappings: validated.midiMappings }),
        ...(validated.otherSettings && { otherSettings: validated.otherSettings }),
        // merge tuner/pitchpipe into otherSettings on update
        ...(validated.tunerSettings && {
          otherSettings: {
            ...validated.otherSettings,
            tunerSettings: validated.tunerSettings,
          },
        }),
        ...(validated.pitchPipeSettings && {
          otherSettings: {
            ...validated.otherSettings,
            pitchPipeSettings: validated.pitchPipeSettings,
          },
        }),
        ...(validated.audioTrackerSettings && {
          otherSettings: {
            ...validated.otherSettings,
            audioTrackerSettings: validated.audioTrackerSettings,
          },
        }),
      },
    });

    return NextResponse.json({ preferences });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error creating preferences:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/stand/preferences
 * Updates user preferences (alias for POST)
 */
export async function PUT(request: NextRequest) {
  return POST(request);
}
