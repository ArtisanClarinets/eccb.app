/**
 * Stand HTTP Helpers — shared response builders and input validators.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

// ─── Standard Responses ───────────────────────────────────────────────────────

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function json404(message = 'Not found'): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function json400(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function json401(message = 'Unauthorized'): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function json403(message = 'Forbidden'): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function json429(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests' },
    {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    }
  );
}

export function json500(message = 'Internal server error'): NextResponse {
  return NextResponse.json({ error: message }, { status: 500 });
}

// ─── Input Validation ─────────────────────────────────────────────────────────

/**
 * Parse and validate a request body against a Zod schema.
 * Returns the parsed data or a 400 NextResponse.
 */
export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T
): Promise<z.infer<T> | NextResponse> {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);
    if (!result.success) {
      const message = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      return json400(`Validation error: ${message}`);
    }
    return result.data;
  } catch {
    return json400('Invalid JSON body');
  }
}

// ─── Common Zod Schemas ───────────────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const cuidSchema = z.string().min(1).max(100);

export const layerSchema = z.enum(['PERSONAL', 'SECTION', 'DIRECTOR']);

/** Max stroke data size: 500KB */
export const MAX_STROKE_DATA_BYTES = 512_000;

export const strokeDataSchema = z
  .unknown()
  .refine(
    (val) => {
      const str = JSON.stringify(val);
      return str.length <= MAX_STROKE_DATA_BYTES;
    },
    { message: `Stroke data exceeds ${MAX_STROKE_DATA_BYTES} bytes` }
  );
