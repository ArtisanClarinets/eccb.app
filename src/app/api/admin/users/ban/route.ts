import { NextRequest, NextResponse } from 'next/server';
import { banUser } from '@/app/(admin)/admin/users/actions';
import { validateCSRF } from '@/lib/csrf';
import { applyRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

// Validation schema for ban user request
const banUserSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  banReason: z.string().optional(),
  banExpires: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting for sensitive admin action
    const rateLimitResponse = await applyRateLimit(request, 'adminAction');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Validate CSRF
    const csrfResult = validateCSRF(request);
    if (!csrfResult.valid) {
      return NextResponse.json(
        { success: false, error: 'CSRF validation failed', reason: csrfResult.reason },
        { status: 403 }
      );
    }

    const body = await request.json();
    
    // Validate input with Zod
    const validated = banUserSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: validated.error.issues[0].message },
        { status: 400 }
      );
    }

    const { userId, banReason, banExpires } = validated.data;

    const result = await banUser(userId, banReason, banExpires ? new Date(banExpires) : undefined);

    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json(result, { status: 400 });
    }
  } catch (error) {
    console.error('Error in ban user API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
