import { createAuthClient } from 'better-auth/react';
import { magicLinkClient, twoFactorClient, adminClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: process.env.BETTER_AUTH_URL,
  plugins: [
    magicLinkClient(),
    twoFactorClient(),
    adminClient(),
  ]
});

export const { useSession, signIn, signOut, signUp, verifyEmail, getSession } = authClient;
