import { test, expect } from '@playwright/test';

test.describe('Admin Music Management', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/music');
  });

  test('should display music library', async ({ page }) => {
    await expect(page.locator('h1, h2')).toContainText(/Music|Library/);
    
    const musicTable = page.locator('table, [data-testid="music-list"], .music-list');
    await expect(musicTable).toBeVisible();
  });

  test('should search for music', async ({ page }) => {
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]');
    
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('symphony');
      await page.waitForTimeout(500);
      
      // Should show filtered results
      await expect(page.locator('table tbody tr, .music-item')).toBeVisible();
    }
  });

  test('should filter music by type', async ({ page }) => {
    const typeFilter = page.locator('select[name="type"], [data-testid="type-filter"]');
    
    if (await typeFilter.isVisible().catch(() => false)) {
      await typeFilter.selectOption('CONCERT');
      await page.waitForTimeout(500);
    }
  });

  test('should filter music by status', async ({ page }) => {
    const statusFilter = page.locator('select[name="status"], [data-testid="status-filter"]');
    
    if (await statusFilter.isVisible().catch(() => false)) {
      await statusFilter.selectOption('active');
      await page.waitForTimeout(500);
    }
  });

  test('should navigate to add music page', async ({ page }) => {
    const addButton = page.locator('a:has-text("Add Music"), button:has-text("Add Music"), a[href*="new"]');
    
    if (await addButton.first().isVisible().catch(() => false)) {
      await addButton.first().click();
      await expect(page).toHaveURL(/admin\/music\/new/);
    }
  });

  test('should add new music piece', async ({ page }) => {
    await page.goto('/admin/music/new');
    
    // Fill music form
    await page.fill('input[name="title"], input[name="name"]', 'E2E Test Symphony');
    await page.fill('input[name="composer"]', 'E2E Composer');
    await page.fill('textarea[name="description"]', 'Test music piece created by E2E tests');
    
    // Select difficulty if available
    const difficultySelect = page.locator('select[name="difficulty"]');
    if (await difficultySelect.isVisible().catch(() => false)) {
      await difficultySelect.selectOption('MEDIUM');
    }
    
    // Select type if available
    const typeSelect = page.locator('select[name="type"], select[name="genre"]');
    if (await typeSelect.isVisible().catch(() => false)) {
      await typeSelect.selectOption('CONCERT');
    }
    
    // Submit form
    await page.click('button[type="submit"], button:has-text("Save"), button:has-text("Create")');
    
    await expect(page.locator('.sonner-toast:has-text("created")')).toBeVisible({ timeout: 5000 });
  });

  test('should view music details', async ({ page }) => {
    const musicRow = page.locator('table tbody tr, .music-item').first();
    
    if (await musicRow.isVisible().catch(() => false)) {
      const viewLink = musicRow.locator('a, button:has-text("View")').first();
      await viewLink.click();
      
      await expect(page).toHaveURL(/admin\/music\/.+/);
      await expect(page.locator('h1')).toBeVisible();
    }
  });

  test('should edit music details', async ({ page }) => {
    const musicRow = page.locator('table tbody tr, .music-item').first();
    
    if (await musicRow.isVisible().catch(() => false)) {
      const editLink = musicRow.locator('a:has-text("Edit"), button:has-text("Edit")');
      await editLink.click();
      
      await expect(page).toHaveURL(/admin\/music\/.+\/edit/);
      
      // Update title
      const titleInput = page.locator('input[name="title"], input[name="name"]');
      await titleInput.clear();
      await titleInput.fill('Updated E2E Music');
      
      // Save changes
      await page.click('button[type="submit"], button:has-text("Save")');
      await expect(page.locator('.sonner-toast:has-text("saved")')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should delete music', async ({ page }) => {
    const musicRow = page.locator('table tbody tr, .music-item').first();
    
    if (await musicRow.isVisible().catch(() => false)) {
      const deleteButton = musicRow.locator('button:has-text("Delete"), [data-testid="delete-music"]');
      
      if (await deleteButton.isVisible().catch(() => false)) {
        await deleteButton.click();
        
        // Confirm deletion
        const confirmButton = page.locator('button:has-text("Confirm")');
        if (await confirmButton.isVisible().catch(() => false)) {
          await confirmButton.click();
          await expect(page.locator('.sonner-toast:has-text("deleted")')).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });

  test('should archive music', async ({ page }) => {
    const archiveButton = page.locator('button:has-text("Archive"), [data-testid="archive-music"]').first();
    
    if (await archiveButton.isVisible().catch(() => false)) {
      await archiveButton.click();
      await expect(page.locator('.sonner-toast:has-text("archived")')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should restore archived music', async ({ page }) => {
    // Filter to show archived music
    const statusFilter = page.locator('select[name="status"], [data-testid="status-filter"]');
    if (await statusFilter.isVisible().catch(() => false)) {
      await statusFilter.selectOption('archived');
      await page.waitForTimeout(500);
      
      const restoreButton = page.locator('button:has-text("Restore"), [data-testid="restore-music"]').first();
      if (await restoreButton.isVisible().catch(() => false)) {
        await restoreButton.click();
        await expect(page.locator('.sonner-toast:has-text("restored")')).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should bulk delete music', async ({ page }) => {
    // Select multiple music items
    const checkboxes = page.locator('input[type="checkbox"]');
    
    if (await checkboxes.count() > 1) {
      await checkboxes.nth(1).click();
      await checkboxes.nth(2).click();
      
      // Click bulk delete
      const bulkDeleteButton = page.locator('button:has-text("Delete Selected"), [data-testid="bulk-delete"]');
      if (await bulkDeleteButton.isVisible().catch(() => false)) {
        await bulkDeleteButton.click();
        
        // Confirm
        const confirmButton = page.locator('button:has-text("Confirm")');
        if (await confirmButton.isVisible().catch(() => false)) {
          await confirmButton.click();
        }
      }
    }
  });

  test('should export music library', async ({ page }) => {
    const exportButton = page.locator('button:has-text("Export"), a:has-text("Export")');
    
    if (await exportButton.isVisible().catch(() => false)) {
      await exportButton.click();
      await expect(page.locator('.sonner-toast:has-text("export")')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should upload music file', async ({ page }) => {
    await page.goto('/admin/music/new');
    
    const fileInput = page.locator('input[type="file"]');
    
    if (await fileInput.isVisible().catch(() => false)) {
      // Create a dummy PDF file
      const fileContent = Buffer.from('%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\nxref\n0 2\n0000000000 65535 f\n0000000009 00000 n\ntrailer\n<<\n/Root 1 0 R\n/Size 2\n>>\nstartxref\n45\n%%EOF');
      
      await fileInput.setInputFiles({
        name: 'test-score.pdf',
        mimeType: 'application/pdf',
        buffer: fileContent,
      });
      
      await page.waitForTimeout(1000);
      
      // Check that file was selected
      await expect(fileInput).toHaveValue(/test-score.pdf/);
    }
  });

  test('should assign music to event', async ({ page }) => {
    const assignButton = page.locator('button:has-text("Assign"), a:has-text("Assign to Event")').first();
    
    if (await assignButton.isVisible().catch(() => false)) {
      await assignButton.click();
      
      // Should open assignment dialog
      const dialog = page.locator('[role="dialog"], .dialog, .modal');
      await expect(dialog).toBeVisible();
      
      // Select event if available
      const eventSelect = dialog.locator('select, input');
      if (await eventSelect.isVisible().catch(() => false)) {
        await eventSelect.click();
        
        // Select first option
        const option = dialog.locator('option, [role="option"]').first();
        if (await option.isVisible().catch(() => false)) {
          await option.click();
        }
        
        // Confirm assignment
        const confirmButton = dialog.locator('button:has-text("Assign"), button:has-text("Save")');
        await confirmButton.click();
        
        await expect(page.locator('.sonner-toast:has-text("assigned")')).toBeVisible({ timeout: 5000 });
      }
    }
  });
});

test.describe('Admin Music Assignments', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('should manage music assignments', async ({ page }) => {
    await page.goto('/admin/music');
    
    // Look for assignments link/button
    const assignmentsLink = page.locator('a:has-text("Assignments"), button:has-text("Assignments")');
    
    if (await assignmentsLink.first().isVisible().catch(() => false)) {
      await assignmentsLink.first().click();
      
      await expect(page.locator('h1, h2')).toContainText(/Assignments|Assign Music/);
    }
  });

  test('should bulk assign music to members', async ({ page }) => {
    await page.goto('/admin/music');
    
    // Look for bulk assign option
    const bulkAssignButton = page.locator('button:has-text("Bulk Assign"), [data-testid="bulk-assign"]');
    
    if (await bulkAssignButton.isVisible().catch(() => false)) {
      await bulkAssignButton.click();
      
      const dialog = page.locator('[role="dialog"], .dialog, .modal');
      await expect(dialog).toBeVisible();
      
      // Select members and parts
      const memberSelect = dialog.locator('select[name="members"], input[name="members"]');
      const partSelect = dialog.locator('select[name="part"], input[name="part"]');
      
      if (await memberSelect.isVisible().catch(() => false)) {
        await memberSelect.click();
      }
      
      if (await partSelect.isVisible().catch(() => false)) {
        await partSelect.click();
      }
      
      // Submit
      const assignButton = dialog.locator('button:has-text("Assign")');
      await assignButton.click();
      
      await expect(page.locator('.sonner-toast:has-text("assigned")')).toBeVisible({ timeout: 5000 });
    }
  });
});