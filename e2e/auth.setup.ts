import 'dotenv/config';
import { test as setup, expect, type Page } from '@playwright/test';
import { hashPassword } from 'better-auth/crypto';
import { prisma } from '../src/lib/db';
import { redis } from '../src/lib/redis';

const adminFile = 'e2e/.auth/admin.json';
const userFile = 'e2e/.auth/user.json';
const memberFile = 'e2e/.auth/member.json';
const SESSION_ENDPOINT = '/api/auth/get-session';

// Test admin credentials
const ADMIN_EMAIL = 'e2e-admin@eccb.app';
const ADMIN_PASSWORD = 'TestPass123!';

// Test user credentials
const USER_EMAIL = 'e2e-user@eccb.app';
const USER_PASSWORD = 'TestPass123!';

// Test member credentials
const MEMBER_EMAIL = 'e2e-member@eccb.app';
const MEMBER_PASSWORD = 'TestPass123!';

async function replaceCredentialAccount(userId: string, password: string) {
  await prisma.account.deleteMany({
    where: {
      providerId: 'credential',
      userId,
    },
  });

  await prisma.account.create({
    data: {
      id: `e2e-${userId}`,
      accountId: userId,
      password: await hashPassword(password),
      providerId: 'credential',
      userId,
    },
  });
}

async function ensureTestUsers() {
  // Create or update test admin
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      name: 'E2E Admin',
      emailVerified: true,
    },
    create: {
      email: ADMIN_EMAIL,
      name: 'E2E Admin',
      emailVerified: true,
    },
  });

  await replaceCredentialAccount(admin.id, ADMIN_PASSWORD);

  // Ensure admin has SUPER_ADMIN role so admin-only APIs consistently pass permission checks.
  const adminRole = await prisma.role.findFirst({ where: { name: 'SUPER_ADMIN' } });
  if (adminRole) {
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: admin.id,
          roleId: adminRole.id,
        },
      },
      update: {},
      create: {
        userId: admin.id,
        roleId: adminRole.id,
      },
    });
  }

  await Promise.allSettled([
    redis.del(`roles:${admin.id}`),
    redis.del(`permissions:${admin.id}`),
  ]);

  // Create or update test user
  const user = await prisma.user.upsert({
    where: { email: USER_EMAIL },
    update: {
      name: 'E2E User',
      emailVerified: true,
    },
    create: {
      email: USER_EMAIL,
      name: 'E2E User',
      emailVerified: true,
    },
  });

  await replaceCredentialAccount(user.id, USER_PASSWORD);

  await Promise.allSettled([
    redis.del(`roles:${user.id}`),
    redis.del(`permissions:${user.id}`),
  ]);

  // Create or update test member
  const member = await prisma.user.upsert({
    where: { email: MEMBER_EMAIL },
    update: {
      name: 'E2E Member',
      emailVerified: true,
    },
    create: {
      email: MEMBER_EMAIL,
      name: 'E2E Member',
      emailVerified: true,
    },
  });

  await replaceCredentialAccount(member.id, MEMBER_PASSWORD);

  // Ensure member has member role
  const memberRole = await prisma.role.findFirst({ where: { name: 'MEMBER' } });
  if (memberRole) {
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: member.id,
          roleId: memberRole.id,
        },
      },
      update: {},
      create: {
        userId: member.id,
        roleId: memberRole.id,
      },
    });
  }

  await Promise.allSettled([
    redis.del(`roles:${member.id}`),
    redis.del(`permissions:${member.id}`),
  ]);

  await prisma.member.upsert({
    where: { userId: member.id },
    update: {
      email: MEMBER_EMAIL,
      firstName: 'E2E',
      lastName: 'Member',
      status: 'ACTIVE',
    },
    create: {
      userId: member.id,
      email: MEMBER_EMAIL,
      firstName: 'E2E',
      joinDate: new Date(),
      lastName: 'Member',
      status: 'ACTIVE',
    },
  });

  return { admin, member, user };
}

interface AuthSetupOptions {
  email: string;
  password: string;
  callbackUrl: string;
  expectedPath: string;
  storagePath: string;
}

async function authenticateAndPersistState(
  page: Page,
  options: AuthSetupOptions,
) {
  await page.goto(`/login?callbackUrl=${encodeURIComponent(options.callbackUrl)}`);

  await page.getByLabel('Email Address').fill(options.email);
  await page.getByLabel('Password').fill(options.password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect
    .poll(async () => {
      const response = await page.request.get(SESSION_ENDPOINT);

      return response.status();
    })
    .toBe(200);

  try {
    await page.waitForURL(`**${options.expectedPath}**`, { timeout: 5000 });
  } catch {
    await page.goto(options.expectedPath);
  }

  await page.waitForURL(`**${options.expectedPath}**`, { timeout: 15000 });

  await page.context().storageState({ path: options.storagePath });
}

setup.describe('Authentication Setup', () => {
  setup.describe.configure({ mode: 'serial' });

  setup.beforeAll(async () => {
    await ensureTestUsers();
  });

  setup('authenticate as admin', async ({ page }) => {
    await authenticateAndPersistState(page, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      callbackUrl: '/admin',
      expectedPath: '/admin',
      storagePath: adminFile,
    });
  });

  setup('authenticate as user', async ({ page }) => {
    await authenticateAndPersistState(page, {
      email: USER_EMAIL,
      password: USER_PASSWORD,
      callbackUrl: '/dashboard',
      expectedPath: '/member',
      storagePath: userFile,
    });
  });

  setup('authenticate as member', async ({ page }) => {
    await authenticateAndPersistState(page, {
      email: MEMBER_EMAIL,
      password: MEMBER_PASSWORD,
      callbackUrl: '/member',
      expectedPath: '/member',
      storagePath: memberFile,
    });
  });
});
