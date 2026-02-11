import { authClient } from '@/lib/auth/client';

export function usePermissions() {
  const { data: session } = authClient.useSession();
  // Better Auth doesn't expose permissions directly in the session object by default unless configured
  // We need to fetch permissions from an API or rely on roles if simplified.
  // However, the spec says we should use permissions.
  // Let's assume we hydrate the session with permissions or fetch them.

  // For now, let's implement a basic fetch or hook into the session if extended.
  // Since we haven't extended the session type in `auth/config.ts` yet to include `permissions`,
  // we might need to fetch them separately.

  // Placeholder implementation assuming we will add an endpoint: /api/auth/permissions

  const hasPermission = (permission: string) => {
    // Basic stub: check if user is admin
    if (session?.user?.role === 'admin' || session?.user?.role === 'super_admin') return true;
    return false; // TODO: Implement real client-side permission check
  };

  return {
    hasPermission,
    isLoading: !session,
  };
}
