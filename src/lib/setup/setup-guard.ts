import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

/**
 * Validates that the request is authorized for setup operations.
 *
 * Rules:
 * 1. SETUP_MODE must be enabled in environment variables.
 * 2. If SETUP_TOKEN is configured, it must match the x-setup-token header.
 *
 * The SETUP_MODE and SETUP_TOKEN values are read from process.env first to allow
 * runtime toggling (e.g. disabling setup mode after the initial setup completes).
 *
 * @param request The incoming request
 * @returns A NextResponse if validation fails (to be returned by the handler), or null if successful.
 */
export function validateSetupRequest(request: Request): NextResponse | null {
  const setupMode = process.env.SETUP_MODE
    ? process.env.SETUP_MODE === 'true'
    : env.SETUP_MODE;

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

  const setupToken = process.env.SETUP_TOKEN ?? env.SETUP_TOKEN;

  // Check setup token if configured
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
  }

  return null;
}
