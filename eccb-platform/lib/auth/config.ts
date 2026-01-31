import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from '@/lib/db';
import { magicLink } from 'better-auth/plugins';
import { sendEmail } from '@/lib/email';
import { env } from '@/lib/env';

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID || '',
      clientSecret: env.GOOGLE_CLIENT_SECRET || '',
      enabled: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    },
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url, token }) => {
        await sendEmail({
          to: email,
          subject: 'Sign in to ECCB Platform',
          html: `<p>Click the link below to sign in:</p><p><a href="${url}">${url}</a></p>`,
          text: `Click the link below to sign in:\n\n${url}`,
        });
      },
    }),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
});

export type Session = typeof auth.$Infer.Session;
