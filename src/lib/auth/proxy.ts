import { auth } from './config';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { rateLimit, getIP } from '@/lib/rate-limit';
import { checkUserPermission } from './permissions';

export type SessionUser = typeof auth.$Infer.Session.user;
export type Session = typeof auth.$Infer.Session.session;

export interface AuthContext {
  user: SessionUser;
  session: Session;
}

/**
 * loads the current session from the request headers
 */
export async function getSession(): Promise<AuthContext | null> {
  const headersList = await headers();
  return auth.api.getSession({ headers: headersList });
}

/**
 * Gets the current authenticated user, or null if not authenticated
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getSession();
  return session?.user ?? null;
}

/**
 * Enforces authentication for a page/layout. Redirects to login if not authenticated.
 */
export async function protectPage(
  permission?: string,
  redirectUrl: string = '/login',
  forbiddenUrl: string = '/forbidden'
): Promise<AuthContext> {
  const session = await getSession();

  if (!session) {
    redirect(redirectUrl);
  }

  if (permission) {
    const hasPermission = await checkUserPermission(session.user.id, permission);
    if (!hasPermission) {
      redirect(forbiddenUrl);
    }
  }

  return session;
}

/**
 * Enforces authentication and rate limiting for Server Actions or API routes.
 * Throws errors instead of redirecting.
 */
export async function protectAction(
  permission?: string,
  rateLimitOptions: { limit: number; window: number } = { limit: 20, window: 60 }
): Promise<AuthContext> {
  const session = await getSession();
  const ip = await getIP();

  // Rate limiting key: use user ID if logged in, otherwise IP (though protectAction implies auth usually)
  const key = session?.user?.id ? `user:${session.user.id}` : `ip:${ip}`;

  const limit = await rateLimit(key, rateLimitOptions);

  if (!limit.success) {
    throw new Error(`Rate limit exceeded. Try again in ${Math.ceil(limit.reset - Date.now() / 1000)} seconds.`);
  }

  if (!session) {
    throw new Error('Unauthorized');
  }

  if (permission) {
    const hasPermission = await checkUserPermission(session.user.id, permission);
    if (!hasPermission) {
      throw new Error('Forbidden: Insufficient permissions');
    }
  }

  return session;
}
