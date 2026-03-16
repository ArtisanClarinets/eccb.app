import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { getSetupState } from '@/lib/setup/state';

/**
 * Validates that the request is authorized for setup operations.
 *
 * Rules:
 * 1. If the system is already ready for login, allow the request.
 * 2. SETUP_MODE must be enabled in environment variables.
 * 3. If SETUP_TOKEN is configured, it must match the x-setup-token header.
 *
 * The SETUP_MODE and SETUP_TOKEN values are read from process.env first to allow
 * runtime toggling (e.g. disabling setup mode after the initial setup completes).
 *
 * @param request The incoming request
 * @returns A NextResponse if validation fails (to be returned by the handler), or null if successful.
 */
export async function validateSetupRequest(request: Request): Promise<NextResponse | null> {
  // If the system is already ready, allow setup requests through.
  try {
    const setupState = await getSetupState();
    if (setupState.readyForLogin) {
      return null;
    }
  } catch {
    // Ignore failures here and fall back to normal validation.
  }

  const setupMode = process.env.SETUP_MODE
    ? process.env.SETUP_MODE.trim().split(/\s+/)[0].toLowerCase() === 'true'
    : env.SETUP_MODE;

  const setupToken = process.env.SETUP_TOKEN ?? env.SETUP_TOKEN;

  // If a setup token exists, validate it first (allows token-only access even if SETUP_MODE is false).
  if (setupToken) {
    const token = request.headers.get('x-setup-token');

    if (!token || token !== setupToken) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid setup token',
        },
        { status: 401 },
      );
    }

    return null;
  }

  // Check if setup mode is enabled
  if (!setupMode) {
    return NextResponse.json(
      {
        success: false,
        error: 'Setup mode is disabled',
      },
      { status: 403 },
    );
  }

  return null;
}

