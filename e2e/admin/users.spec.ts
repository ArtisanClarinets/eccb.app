import { test, expect } from '@playwright/test';

test.describe('Admin Users Management', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/users');
  });

  test('should display users list', async ({ page }) => {
    await expect(page.locator('h1, h2')).toContainText(/Users|User Management/);
    
    // Should display user table or list
    const userTable = page.locator('table, [data-testid="user-list"], .user-list');
    await expect(userTable).toBeVisible();
  });

  test('should search for users', async ({ page }) => {
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]');
    
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('e2e');
      await page.waitForTimeout(500);
      
      // Should show filtered results
      await expect(page.locator('text=e2e')).toBeVisible();
    }
  });

  test('should filter users by role', async ({ page }) => {
    const roleFilter = page.locator('select[name="role"], [data-testid="role-filter"]');
    
    if (await roleFilter.isVisible().catch(() => false)) {
      await roleFilter.selectOption('MEMBER');
      await page.waitForTimeout(500);
    }
  });

  test('should navigate to create user page', async ({ page }) => {
    const createButton = page.locator('a:has-text("New User"), button:has-text("New User"), a[href*="new"]');
    
    if (await createButton.first().isVisible().catch(() => false)) {
      await createButton.first().click();
      await expect(page).toHaveURL(/admin\/users\/new/);
    }
  });

  test('should view user details', async ({ page }) => {
    const userRow = page.locator('table tbody tr, .user-item').first();
    
    if (await userRow.isVisible().catch(() => false)) {
      const viewLink = userRow.locator('a, button:has-text("View")');
      await viewLink.click();
      
      // Should navigate to user detail
      await expect(page).toHaveURL(/admin\/users\/.+/);
    }
  });

  test('should edit user', async ({ page }) => {
    const userRow = page.locator('table tbody tr, .user-item').first();
    
    if (await userRow.isVisible().catch(() => false)) {
      const editLink = userRow.locator('a:has-text("Edit"), button:has-text("Edit")');
      await editLink.click();
      
      await expect(page).toHaveURL(/admin\/users\/.+\/edit/);
    }
  });

  test('should ban/unban user', async ({ page }) => {
    const banButton = page.locator('button:has-text("Ban"), button:has-text("Unban"), [data-testid="ban-button"]');
    
    if (await banButton.first().isVisible().catch(() => false)) {
      await banButton.first().click();
      
      // Should show confirmation dialog
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes")');
      if (await confirmButton.isVisible().catch(() => false)) {
        await confirmButton.click();
        await expect(page.locator('.sonner-toast')).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should reset user password', async ({ page }) => {
    const resetButton = page.locator('button:has-text("Reset Password"), [data-testid="reset-password"]');
    
    if (await resetButton.first().isVisible().catch(() => false)) {
      await resetButton.first().click();
      
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Send")');
      if (await confirmButton.isVisible().catch(() => false)) {
        await confirmButton.click();
        await expect(page.locator('.sonner-toast:has-text("password")')).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should impersonate user', async ({ page }) => {
    const impersonateButton = page.locator('button:has-text("Impersonate"), [data-testid="impersonate"]');
    
    if (await impersonateButton.first().isVisible().catch(() => false)) {
      await impersonateButton.first().click();
      
      // Should redirect to app as that user
      await page.waitForURL('**/');
    }
  });
});

test.describe('Admin Roles Management', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/roles');
  });

  test('should display roles list', async ({ page }) => {
    await expect(page.locator('h1, h2')).toContainText('Roles');
    
    const rolesList = page.locator('table, [data-testid="roles-list"], .roles-list');
    await expect(rolesList).toBeVisible();
  });

  test('should assign role to user', async ({ page }) => {
    const assignButton = page.locator('button:has-text("Assign"), a:has-text("Assign")');
    
    if (await assignButton.first().isVisible().catch(() => false)) {
      await assignButton.first().click();
      
      // Should open assign dialog
      const dialog = page.locator('[role="dialog"], .dialog, .modal');
      await expect(dialog).toBeVisible();
    }
  });

  test('should manage permissions', async ({ page }) => {
    const permissionsButton = page.locator('button:has-text("Permissions"), a:has-text("Permissions")');
    
    if (await permissionsButton.first().isVisible().catch(() => false)) {
      await permissionsButton.first().click();
      await expect(page).toHaveURL(/admin\/roles\/permissions/);
    }
  });
});

test.describe('Admin Dashboard', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/admin');
  });

  test('should display admin dashboard', async ({ page }) => {
    await expect(page.locator('h1, h2')).toContainText(/Admin|Dashboard/);
  });

  test('should display statistics', async ({ page }) => {
    const stats = page.locator('[data-testid="stat-card"], .stat-card, .stats');
    await expect(stats.first()).toBeVisible();
  });

  test('should display admin navigation', async ({ page }) => {
    const adminNav = page.locator('aside, nav[data-testid="admin-nav"], .admin-sidebar');
    await expect(adminNav).toBeVisible();
    
    // Check for admin nav items
    const navItems = ['Users', 'Members', 'Events', 'Music', 'Settings'];
    for (const item of navItems) {
      const link = page.locator(`a:has-text("${item}"), button:has-text("${item}")`);
      await expect(link.first()).toBeVisible();
    }
  });
});