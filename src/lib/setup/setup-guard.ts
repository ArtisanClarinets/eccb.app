import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

/**
 * Validates that the request is authorized for setup operations.
 *
 * Rules:
 * 1. SETUP_MODE must be enabled in environment variables.
 * 2. If SETUP_TOKEN is configured, it must match the x-setup-token header.
 *
 * @param request The incoming request
 * @returns A NextResponse if validation fails (to be returned by the handler), or null if successful.
 */
export function validateSetupRequest(request: Request): NextResponse | null {
  // Check if setup mode is enabled
  if (!env.SETUP_MODE) {
    return NextResponse.json(
      {
        success: false,
        error: 'Setup mode is disabled',
      },
      { status: 403 }
    );
  }

  // Check setup token if configured
  if (env.SETUP_TOKEN) {
    const token = request.headers.get('x-setup-token');

    if (!token || token !== env.SETUP_TOKEN) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid setup token',
        },
        { status: 401 }
      );
    }
  }

  return null;
}
