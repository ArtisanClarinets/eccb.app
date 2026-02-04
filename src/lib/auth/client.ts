import { createAuthClient } from 'better-auth/client';

export const authClient = createAuthClient({
  baseURL: process.env.BETTER_AUTH_URL,
});

export const { useSession, signIn, signOut, signUp, forgetPassword, resetPassword, verifyEmail, getSession } = authClient;
