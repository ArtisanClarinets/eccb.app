import { createAuthClient } from 'better-auth/react';
import { magicLinkClient, twoFactorClient, adminClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  plugins: [
    magicLinkClient(),
    twoFactorClient(),
    adminClient(),
  ]
});

export const { useSession, signIn, signOut, signUp, verifyEmail, getSession } = authClient;
