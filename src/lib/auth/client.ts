import { createAuthClient } from 'better-auth/react';
import { magicLinkClient, twoFactorClient, adminClient } from 'better-auth/client/plugins';

/**
 * Better Auth client for React/Next.js
 * 
 * Note: baseURL is intentionally NOT set here because the Better Auth server
 * is running on the same Next.js app at /api/auth/[...all]. When the server
 * is on the same origin at /api/auth, the client will automatically discover
 * and use the correct endpoint without explicit baseURL configuration.
 * 
 * See: https://www.better-auth.com/docs/integrations/next
 */
export const authClient = createAuthClient({
  plugins: [
    magicLinkClient(),
    twoFactorClient(),
    adminClient(),
  ]
});

export const { useSession, signIn, signOut, signUp, verifyEmail, getSession } = authClient;
