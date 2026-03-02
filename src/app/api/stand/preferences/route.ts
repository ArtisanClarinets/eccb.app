import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { applyRateLimit } from '@/lib/rate-limit';
import { requireStandAccess } from '@/lib/stand/access';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    const rateLimited = await applyRateLimit(request, 'stand-preferences');
    if (rateLimited) return rateLimited;

    const ctx = await requireStandAccess();
    if (ctx instanceof NextResponse) return ctx;

    let preferences = await prisma.userPreferences.findUnique({
      where: { userId: ctx.userId },
    });

    // Create default preferences if they don't exist
    if (!preferences) {
      preferences = await prisma.userPreferences.create({
        data: {
          userId: ctx.userId,
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

    const ctx = await requireStandAccess();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const validated = preferencesUpdateSchema.parse(body);

    // Read existing preferences so we can deep-merge otherSettings
    const existing = await prisma.userPreferences.findUnique({
      where: { userId: ctx.userId },
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
      where: { userId: ctx.userId },
      create: {
        userId: ctx.userId,
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
