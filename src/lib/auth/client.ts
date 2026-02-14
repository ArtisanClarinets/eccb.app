import { createAuthClient } from 'better-auth/react';
import { magicLinkClient, twoFactorClient, adminClient } from 'better-auth/client/plugins';

// Get the base URL for the auth client
// Falls back to window.location.origin for client-side when env var is not set
const getBaseURL = (): string => {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) {
    return envUrl;
  }
  // Fallback to window.location.origin in browser context
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  // Empty string as last resort (will cause errors, but indicates misconfiguration)
  return '';
};

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
  plugins: [
    magicLinkClient(),
    twoFactorClient(),
    adminClient(),
  ]
});

export const { useSession, signIn, signOut, signUp, verifyEmail, getSession } = authClient;
