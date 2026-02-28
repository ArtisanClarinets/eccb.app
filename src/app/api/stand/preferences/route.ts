import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { applyRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';

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
 * Creates user preferences (or updates if exists) with safe deep merge.
 * Body: { nightMode?, metronomeSettings?, tunerSettings?, pitchPipeSettings?,
 *         audioTrackerSettings?, midiMappings?, otherSettings? }
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit preference writes
    const rateLimited = await applyRateLimit(request, 'stand-preferences');
    if (rateLimited) return rateLimited;

    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = preferencesUpdateSchema.parse(body);

    // Read existing preferences so we can deep-merge otherSettings
    const existing = await prisma.userPreferences.findUnique({
      where: { userId: session.user.id },
    });

    const existingOther =
      (existing?.otherSettings as Record<string, unknown> | null) ?? {};

    // Deep-merge: existing otherSettings ← new otherSettings ← sub-key overrides
    const mergedOtherSettings: Record<string, unknown> = {
      ...existingOther,
      ...(validated.otherSettings ?? {}),
      ...(validated.tunerSettings && { tunerSettings: validated.tunerSettings }),
      ...(validated.pitchPipeSettings && { pitchPipeSettings: validated.pitchPipeSettings }),
      ...(validated.audioTrackerSettings && {
        audioTrackerSettings: validated.audioTrackerSettings,
      }),
    };

    const preferences = await prisma.userPreferences.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        nightMode: validated.nightMode ?? false,
        metronomeSettings: validated.metronomeSettings ?? {},
        midiMappings: validated.midiMappings ?? {},
        otherSettings: mergedOtherSettings as Prisma.InputJsonValue,
      },
      update: {
        ...(validated.nightMode !== undefined && { nightMode: validated.nightMode }),
        ...(validated.metronomeSettings && { metronomeSettings: validated.metronomeSettings }),
        ...(validated.midiMappings && { midiMappings: validated.midiMappings }),
        otherSettings: mergedOtherSettings as Prisma.InputJsonValue,
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

/**
 * PATCH /api/stand/preferences
 * Partial update — merges only the supplied keys into existing preferences.
 * Identical semantics to POST but named explicitly for REST clarity.
 */
export async function PATCH(request: NextRequest) {
  return POST(request);
}
