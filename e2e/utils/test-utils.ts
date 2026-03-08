import { Page, expect, Request } from '@playwright/test';

/**
 * Wait for a toast notification to appear
 */
export async function waitForToast(page: Page, text: string, timeout = 5000): Promise<void> {
  await expect(page.locator(`.sonner-toast:has-text("${text}")`)).toBeVisible({ timeout });
}

/**
 * Login with credentials
 */
export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/');
}

/**
 * Logout current user
 */
export async function logout(page: Page): Promise<void> {
  const logoutButton = page.locator('button:has-text("Sign Out"), a:has-text("Sign Out"), button:has-text("Logout")');
  if (await logoutButton.isVisible().catch(() => false)) {
    await logoutButton.click();
    await page.waitForURL('/');
  }
}

/**
 * Fill a form field by label or placeholder
 */
export async function fillField(
  page: Page,
  label: string,
  value: string
): Promise<void> {
  const field = page.locator(`label:has-text("${label}") + input, input[placeholder*="${label}" i], input[name*="${label.toLowerCase()}" i]`);
  await field.fill(value);
}

/**
 * Click a button by text
 */
export async function clickButton(page: Page, text: string): Promise<void> {
  await page.click(`button:has-text("${text}"), a:has-text("${text}")`);
}

/**
 * Check if an element is visible with retry
 */
export async function isVisible(
  page: Page,
  selector: string,
  timeout = 5000
): Promise<boolean> {
  try {
    await page.locator(selector).waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for network idle after action
 */
export async function waitForNetworkIdle(
  page: Page,
  action: () => Promise<void>
): Promise<void> {
  await Promise.all([
    page.waitForLoadState('networkidle'),
    action(),
  ]);
}

/**
 * Get element text content
 */
export async function getText(page: Page, selector: string): Promise<string | null> {
  return await page.locator(selector).textContent();
}

/**
 * Take a screenshot with timestamp
 */
export async function takeScreenshot(page: Page, name: string): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await page.screenshot({ path: `e2e/screenshots/${name}-${timestamp}.png` });
}

/**
 * Mock API response
 */
export async function mockApiResponse(
  page: Page,
  url: string | RegExp,
  response: object,
  status = 200
): Promise<void> {
  await page.route(url, async (route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

/**
 * Wait for API response
 */
export async function waitForApiResponse(
  page: Page,
  url: string | RegExp
): Promise<Request> {
  return await page.waitForRequest(url);
}

/**
 * Clear local storage and cookies
 */
export async function clearStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.context().clearCookies();
}

/**
 * Resize viewport to mobile size
 */
export async function setMobileViewport(page: Page): Promise<void> {
  await page.setViewportSize({ width: 375, height: 667 });
}

/**
 * Resize viewport to tablet size
 */
export async function setTabletViewport(page: Page): Promise<void> {
  await page.setViewportSize({ width: 768, height: 1024 });
}

/**
 * Resize viewport to desktop size
 */
export async function setDesktopViewport(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 });
}

/**
 * Scroll to element
 */
export async function scrollToElement(page: Page, selector: string): Promise<void> {
  await page.locator(selector).scrollIntoViewIfNeeded();
}

/**
 * Upload a file
 */
export async function uploadFile(
  page: Page,
  selector: string,
  filePath: string
): Promise<void> {
  await page.locator(selector).setInputFiles(filePath);
}

/**
 * Check if element has class
 */
export async function hasClass(
  page: Page,
  selector: string,
  className: string
): Promise<boolean> {
  const classes = await page.locator(selector).getAttribute('class');
  return classes?.includes(className) ?? false;
}

/**
 * Wait for element to disappear
 */
export async function waitForElementToDisappear(
  page: Page,
  selector: string,
  timeout = 5000
): Promise<void> {
  await page.locator(selector).waitFor({ state: 'hidden', timeout });
}

/**
 * Get all console errors
 */
export async function getConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  return errors;
}

/**
 * Format date for input fields
 */
export function formatDateForInput(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Generate random email
 */
export function generateRandomEmail(): string {
  const random = Math.random().toString(36).substring(7);
  return `test-${random}@eccb.app`;
}

/**
 * Generate random string
 */
export function generateRandomString(length = 10): string {
  return Math.random().toString(36).substring(2, 2 + length);
}

/**
 * Retry a flaky operation
 */
export async function retry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3,
  delay = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('Retry failed');
}

/**
 * Test helper for form validation
 */
export async function expectFieldValidation(
  page: Page,
  fieldName: string,
  invalidValue: string,
  errorMessage?: string
): Promise<void> {
  await page.fill(`input[name="${fieldName}"]`, invalidValue);
  await page.click('button[type="submit"]');

  if (errorMessage) {
    await expect(page.locator(`text=${errorMessage}`)).toBeVisible();
  }
}

/**
 * Test helper for API response validation
 */
export function expectApiSuccess(response: { status(): number }): void {
  expect(response.status()).toBeGreaterThanOrEqual(200);
  expect(response.status()).toBeLessThan(300);
}

/**
 * Test helper for API error validation
 */
export function expectApiError(
  response: { status(): number; json(): Promise<Record<string, unknown>> },
  expectedStatus: number,
  expectedError?: string
): void {
  expect(response.status()).toBe(expectedStatus);
  if (expectedError) {
    response.json().then((body) => {
      const errorMessage = body.error || body.message || '';
      expect(errorMessage.toString().toLowerCase()).toContain(expectedError.toLowerCase());
    });
  }
}

// Constants
export const TEST_USERS = {
  admin: {
    email: 'e2e-admin@eccb.app',
    password: 'TestPass123!',
    name: 'E2E Admin',
  },
  user: {
    email: 'e2e-user@eccb.app',
    password: 'TestPass123!',
    name: 'E2E User',
  },
  member: {
    email: 'e2e-member@eccb.app',
    password: 'TestPass123!',
    name: 'E2E Member',
  },
};

export const TIMEOUTS = {
  short: 5000,
  medium: 15000,
  long: 30000,
};

export const VIEWPORTS = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 720 },
  wide: { width: 1920, height: 1080 },
};
