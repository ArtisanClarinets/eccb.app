import { NextRequest, NextResponse } from 'next/server';
import { impersonateUser } from '@/app/(admin)/admin/users/actions';
import { validateCSRF } from '@/lib/csrf';
import { applyRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

// Validation schema for impersonate user request
const impersonateUserSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
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
    const validated = impersonateUserSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: validated.error.issues[0].message },
        { status: 400 }
      );
    }

    const { userId } = validated.data;

    const result = await impersonateUser(userId);

    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json(result, { status: 400 });
    }
  } catch (error) {
    console.error('Error in impersonate user API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
