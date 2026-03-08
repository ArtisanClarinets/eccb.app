import { test, expect, type Page } from '@playwright/test';

async function expectAuthenticatedEmail(page: Page, email: string) {
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/auth/get-session');
      if (response.status() !== 200) {
        return null;
      }

      const body = await response.json();
      return body?.user?.email ?? null;
    })
    .toBe(email);
}

test.describe('Authentication Flows', () => {
  test.describe('Login Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/login');
    });

    test('should display login form', async ({ page }) => {
      await expect(page.locator('h3:has-text("Member Sign In")')).toBeVisible();
      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]:has-text("Sign In")')).toBeVisible();
    });

    test('should show validation errors for empty fields', async ({ page }) => {
      await page.click('button[type="submit"]');
      
      // HTML5 validation should prevent submission
      const emailInput = page.locator('input[name="email"]');
      await expect(emailInput).toHaveAttribute('required', '');
    });

    test('should show validation error for invalid email format', async ({ page }) => {
      await page.fill('input[name="email"]', 'invalid-email');
      await page.fill('input[name="password"]', 'password123');
      await page.click('button[type="submit"]');
      
      // Browser should validate email format
      const emailInput = page.locator('input[name="email"]');
      await expect(emailInput).toHaveAttribute('type', 'email');
    });

    test('should show error for incorrect credentials', async ({ page }) => {
      await page.fill('input[name="email"]', 'wrong@example.com');
      await page.fill('input[name="password"]', 'WrongPassword123!');
      await page.click('button[type="submit"]');

      await expect(page).toHaveURL(/\/login/);
      await expect
        .poll(async () => {
          const response = await page.request.get('/api/auth/get-session');
          return await response.json();
        })
        .toBeNull();
    });

    test('should successfully login with valid credentials', async ({ page }) => {
      await page.fill('input[name="email"]', 'e2e-user@eccb.app');
      await page.fill('input[name="password"]', 'TestPass123!');
      await page.click('button[type="submit"]');

      await expectAuthenticatedEmail(page, 'e2e-user@eccb.app');
      await expect(page).not.toHaveURL(/\/login/);
    });

    test('should navigate to forgot password page', async ({ page }) => {
      await page.click('a:has-text("Forgot password")');
      await expect(page).toHaveURL('/forgot-password');
    });

    test('should navigate to signup page', async ({ page }) => {
      await page.click('a:has-text("Register as a Musician")');
      await expect(page).toHaveURL('/signup');
    });

    test('should navigate back to home', async ({ page }) => {
      await page.click('a:has-text("Back to Home")');
      await expect(page).toHaveURL('/');
    });
  });

  test.describe('Forgot Password Flow', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/forgot-password');
    });

    test('should display forgot password form', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Forgot Password' })).toBeVisible();
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]:has-text("Send Reset Link")')).toBeVisible();
    });

    test('should show the generic success state for a non-existent email', async ({ page }) => {
      await page.fill('input[type="email"]', 'nonexistent@example.com');
      await page.click('button[type="submit"]');

      await expect(page.getByRole('heading', { name: 'Check Your Email' })).toBeVisible({ timeout: 5000 });
    });

    test('should send reset link for valid email', async ({ page }) => {
      await page.fill('input[type="email"]', 'e2e-user@eccb.app');
      await page.click('button[type="submit"]');

      await expect(page.getByRole('heading', { name: 'Check Your Email' })).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Signup Flow', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/signup');
    });

    test('should display signup form', async ({ page }) => {
      await expect(page.locator('[data-slot="card-title"]').filter({ hasText: 'Create Account' })).toBeVisible();
      await expect(page.locator('input[name="name"]')).toBeVisible();
      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
    });

    test('should validate password minimum length', async ({ page }) => {
      await page.fill('input[name="name"]', 'Test User');
      await page.fill('input[name="email"]', 'test@example.com');
      await page.fill('input[name="password"]', 'short');
      await page.click('button[type="submit"]');

      await expect(page.locator('[data-sonner-toast], .sonner-toast').filter({ hasText: /password/i }).first()).toBeVisible({ timeout: 5000 });
    });

    test('should validate email format', async ({ page }) => {
      await page.fill('input[name="email"]', 'invalid-email');
      await page.click('button[type="submit"]');
      
      const emailInput = page.locator('input[name="email"]');
      await expect(emailInput).toHaveAttribute('type', 'email');
    });

    test('should navigate back to sign in from signup', async ({ page }) => {
      await page.getByRole('link', { name: 'Sign in' }).click();
      await expect(page).toHaveURL('/login');
    });
  });

  test.describe('Logout Flow', () => {
    test.use({ storageState: 'e2e/.auth/user.json' });

    test('should successfully logout', async ({ page }) => {
      await page.goto('/member');
      await page.getByRole('button', { name: /e2e user/i }).click();
      await page.getByRole('menuitem', { name: 'Sign Out' }).click();
      await expect(page).toHaveURL('/');
    });
  });

  test.describe('Protected Routes', () => {
    test('should redirect unauthenticated users from admin', async ({ page }) => {
      await page.goto('/admin');
      
      // Should redirect to login
      await expect(page).toHaveURL(/login/);
    });

    test('should redirect unauthenticated users from member area', async ({ page }) => {
      await page.goto('/member');
      
      // Should redirect to login
      await expect(page).toHaveURL(/login/);
    });

    test('should redirect to callback URL after login', async ({ page }) => {
      const callbackUrl = '/member/events';
      await page.goto(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      
      await page.fill('input[name="email"]', 'e2e-member@eccb.app');
      await page.fill('input[name="password"]', 'TestPass123!');
      await page.click('button[type="submit"]');
      
      await page.waitForURL(`**${callbackUrl}**`);
    });
  });

  test.describe('Session Management', () => {
    test.use({ storageState: 'e2e/.auth/user.json' });

    test('should maintain session across page reloads', async ({ page }) => {
      await page.goto('/member');
      await page.reload();

      await expect(page).toHaveURL('/member');
      await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    });

    test('should refresh session token', async ({ page }) => {
      await page.goto('/member');
      await page.goto('/member/profile');

      await expect(page).toHaveURL('/member/profile');
      await expect(page).not.toHaveURL(/\/login/);
    });
  });

  test.describe('Rate Limiting', () => {
    test('should handle rate limiting on login attempts', async ({ page }) => {
      await page.goto('/login');
      
      // Make multiple failed login attempts
      for (let i = 0; i < 5; i++) {
        await page.fill('input[name="email"]', 'test@example.com');
        await page.fill('input[name="password"]', `wrong${i}`);
        await page.click('button[type="submit"]');
        await page.waitForTimeout(500);
      }

      if (process.env.NODE_ENV === 'production') {
        await expect(page.locator('[data-sonner-toast], .sonner-toast').filter({ hasText: /too many|rate|wait|limit/i }).first()).toBeVisible({ timeout: 5000 });
      } else {
        await expect(page).toHaveURL(/\/login/);
      }
    });
  });
});
