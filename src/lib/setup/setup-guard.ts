import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import crypto from 'crypto';

interface SetupGuardOptions {
  destructive?: boolean;
}

/**
 * Compare two strings using timing-safe equality to prevent timing attacks.
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function checkSetupAllowed(
  request: NextRequest,
  options: SetupGuardOptions = { destructive: false }
): Promise<NextResponse | null> {
  // 1. Check SETUP_MODE
  if (!env.SETUP_MODE) {
    return NextResponse.json(
      { error: 'Setup mode is disabled. To enable, set SETUP_MODE=true in environment variables.' },
      { status: 403 }
    );
  }

  // 2. Check SETUP_TOKEN header
  const token = request.headers.get('x-setup-token');
  if (!env.SETUP_TOKEN || !token || !safeCompare(token, env.SETUP_TOKEN)) {
    return NextResponse.json(
      { error: 'Invalid or missing setup token. Provide X-Setup-Token header.' },
      { status: 403 }
    );
  }

  // 3. Check initialization status
  let isInitialized = false;
  try {
    // If we can't connect, we assume not initialized (safe for setup)
    const userCount = await prisma.user.count();
    isInitialized = userCount > 0;
  } catch (error) {
    // DB likely not set up
    isInitialized = false;
  }

  if (isInitialized) {
    // If destructive action is requested on initialized DB
    if (options.destructive) {
      // In production, we might want to block completely
      if (env.NODE_ENV === 'production') {
         // But maybe they really want to reset?
         // For now, allow if token matches, but log warning.
         console.warn(`[SECURITY] Destructive setup action on initialized database requested.`);
      }
    }
  }

  return null; // Allowed
}
