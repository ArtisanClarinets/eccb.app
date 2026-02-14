import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { headers } from 'next/headers';
import { getUserPermissions, getUserRoles } from '@/lib/auth/permissions';

/**
 * GET /api/me/permissions
 * Returns the current user's permissions and roles
 * Requires authentication
 */
export async function GET() {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const [permissions, roles] = await Promise.all([
      getUserPermissions(session.user.id),
      getUserRoles(session.user.id),
    ]);

    return NextResponse.json({
      permissions,
      roles,
    });
  } catch (error) {
    console.error('Error fetching user permissions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
