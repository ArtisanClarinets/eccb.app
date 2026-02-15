import { auth } from '@/lib/auth/config';
import { toNextJsHandler } from 'better-auth/next-js';
import { NextRequest, NextResponse } from 'next/server';
import {
  rateLimitSignIn,
  rateLimitSignUp,
  rateLimitPasswordReset,
  rateLimitEmailVerification,
  getIP,
} from '@/lib/rate-limit';

// Get the default Better Auth handlers
const { GET: defaultGET, POST: defaultPOST } = toNextJsHandler(auth);

/**
 * Extract email from request body for rate limiting purposes
 */
async function extractEmailFromRequest(request: NextRequest): Promise<string | null> {
  try {
    // Clone the request to read the body without consuming it
    const clonedRequest = request.clone();
    const body = await clonedRequest.json();
    return body?.email || null;
  } catch {
    return null;
  }
}

/**
 * Determine the auth action from the request path and body
 */
function getAuthAction(path: string): string | null {
  const segments = path.split('/').filter(Boolean);
  // Path format: /api/auth/[action] or /api/auth/[...action]
  const authIndex = segments.indexOf('auth');
  if (authIndex === -1 || authIndex + 1 >= segments.length) {
    return null;
  }
  return segments[authIndex + 1];
}

/**
 * Apply rate limiting based on the auth action
 */
async function applyAuthRateLimit(
  request: NextRequest
): Promise<{ allowed: boolean; response?: NextResponse }> {
  const path = request.nextUrl.pathname;
  const action = getAuthAction(path);
  const method = request.method;

  // Only rate limit POST requests (mutations)
  if (method !== 'POST') {
    return { allowed: true };
  }

  let rateLimitResult;
  let email: string | null = null;

  switch (action) {
    case 'sign-in':
    case 'signin':
      rateLimitResult = await rateLimitSignIn();
      break;

    case 'sign-up':
    case 'signup':
    case 'register':
      rateLimitResult = await rateLimitSignUp();
      break;

    case 'forgot-password':
    case 'reset-password':
      email = await extractEmailFromRequest(request);
      if (email) {
        rateLimitResult = await rateLimitPasswordReset(email);
      } else {
        // If no email, use IP-based rate limiting
        const ip = await getIP();
        rateLimitResult = await rateLimitPasswordReset(ip);
      }
      break;

    case 'verify-email':
    case 'verify':
      email = await extractEmailFromRequest(request);
      if (email) {
        rateLimitResult = await rateLimitEmailVerification(email);
      } else {
        // If no email, use IP-based rate limiting
        const ip = await getIP();
        rateLimitResult = await rateLimitEmailVerification(ip);
      }
      break;

    default:
      // For other auth actions, use general auth rate limit
      return { allowed: true };
  }

  if (!rateLimitResult.success) {
    const response = NextResponse.json(
      {
        error: 'Too many requests',
        message: 'Please try again later',
        retryAfter: rateLimitResult.retryAfter,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimitResult.retryAfter ?? 60),
          'X-RateLimit-Limit': String(rateLimitResult.limit),
          'X-RateLimit-Remaining': String(rateLimitResult.remaining),
          'X-RateLimit-Reset': String(rateLimitResult.reset),
        },
      }
    );
    return { allowed: false, response };
  }

  return { allowed: true };
}

/**
 * GET handler for auth endpoints
 */
export async function GET(request: NextRequest): Promise<Response> {
  // Apply rate limiting for sensitive GET endpoints
  const { allowed, response } = await applyAuthRateLimit(request);
  if (!allowed && response) {
    return response;
  }

  // Call the default Better Auth handler
  return defaultGET(request);
}

/**
 * POST handler for auth endpoints with rate limiting
 */
export async function POST(request: NextRequest): Promise<Response> {
  // Apply rate limiting
  const { allowed, response } = await applyAuthRateLimit(request);
  if (!allowed && response) {
    return response;
  }

  // Call the default Better Auth handler
  return defaultPOST(request);
}
