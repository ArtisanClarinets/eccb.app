import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from '@/lib/db';
import { magicLink, twoFactor, admin, openAPI } from 'better-auth/plugins';
import { sendEmail } from '@/lib/email';
import { env } from '@/lib/env';

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'mysql',
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }: { user: { email: string; name?: string | null }; url: string }) => {
      await sendEmail({
        to: user.email,
        subject: 'Reset your password - ECCB Platform',
        html: `
          <h2>Password Reset Request</h2>
          <p>Hi ${user.name || 'there'},</p>
          <p>Click the link below to reset your password:</p>
          <p><a href="${url}" style="padding: 12px 24px; background: #0f766e; color: white; text-decoration: none; border-radius: 6px;">Reset Password</a></p>
          <p>Or copy this link: ${url}</p>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this, please ignore this email.</p>
        `,
        text: `Reset your password by visiting: ${url}`,
      });
    },
    sendVerificationEmail: async ({ user, url }: { user: { email: string; name?: string | null }; url: string }) => {
      await sendEmail({
        to: user.email,
        subject: 'Verify your email - ECCB Platform',
        html: `
          <h2>Welcome to ECCB Platform!</h2>
          <p>Hi ${user.name || 'there'},</p>
          <p>Please verify your email address by clicking the link below:</p>
          <p><a href="${url}" style="padding: 12px 24px; background: #0f766e; color: white; text-decoration: none; border-radius: 6px;">Verify Email</a></p>
          <p>Or copy this link: ${url}</p>
        `,
        text: `Verify your email by visiting: ${url}`,
      });
    },
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
      sendMagicLink: async ({ email, url }) => {
        await sendEmail({
          to: email,
          subject: 'Sign in to ECCB Platform',
          html: `
            <h2>Magic Link Sign In</h2>
            <p>Click the link below to sign in:</p>
            <p><a href="${url}" style="padding: 12px 24px; background: #0f766e; color: white; text-decoration: none; border-radius: 6px;">Sign In</a></p>
            <p>Or copy this link: ${url}</p>
            <p>This link will expire in 15 minutes.</p>
          `,
          text: `Click the link below to sign in:\n\n${url}`,
        });
      },
    }),
    twoFactor({
      issuer: env.NEXT_PUBLIC_APP_NAME,
    }),
    admin(),
    openAPI(),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [env.NEXT_PUBLIC_APP_URL],
});

export type Session = typeof auth.$Infer.Session;
