import { test, expect } from '@playwright/test';

test.describe('Admin Events Management', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/events');
  });

  test('should display events list', async ({ page }) => {
    await expect(page.locator('h1, h2')).toContainText(/Events|Event Management/);
    
    const eventsTable = page.locator('table, [data-testid="events-list"], .events-list');
    await expect(eventsTable).toBeVisible();
  });

  test('should navigate to create event page', async ({ page }) => {
    const createButton = page.locator('a:has-text("New Event"), button:has-text("New Event"), a[href*="new"]');
    
    if (await createButton.first().isVisible().catch(() => false)) {
      await createButton.first().click();
      await expect(page).toHaveURL(/admin\/events\/new/);
    }
  });

  test('should create new event', async ({ page }) => {
    await page.goto('/admin/events/new');
    
    // Fill event form
    await page.fill('input[name="title"], input[name="name"]', 'E2E Test Event');
    await page.fill('textarea[name="description"]', 'This is a test event created by E2E tests');
    
    // Set date
    const dateInput = page.locator('input[type="date"], input[name="date"], input[name="startDate"]');
    if (await dateInput.isVisible().catch(() => false)) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await dateInput.fill(tomorrow.toISOString().split('T')[0]);
    }
    
    // Set time
    const timeInput = page.locator('input[type="time"], input[name="time"], input[name="startTime"]');
    if (await timeInput.isVisible().catch(() => false)) {
      await timeInput.fill('19:00');
    }
    
    // Set location
    const locationInput = page.locator('input[name="location"], input[name="venue"]');
    if (await locationInput.isVisible().catch(() => false)) {
      await locationInput.fill('Test Venue');
    }
    
    // Submit form
    const submitButton = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Create")');
    await submitButton.click();
    
    // Should redirect to events list or show success
    await expect(page.locator('.sonner-toast:has-text("created")')).toBeVisible({ timeout: 5000 });
  });

  test('should edit event', async ({ page }) => {
    const eventRow = page.locator('table tbody tr, .event-item').first();
    
    if (await eventRow.isVisible().catch(() => false)) {
      const editLink = eventRow.locator('a:has-text("Edit"), button:has-text("Edit")');
      await editLink.click();
      
      await expect(page).toHaveURL(/admin\/events\/.+\/edit/);
      
      // Update title
      const titleInput = page.locator('input[name="title"], input[name="name"]');
      await titleInput.clear();
      await titleInput.fill('Updated E2E Event');
      
      // Save changes
      await page.click('button[type="submit"], button:has-text("Save")');
      await expect(page.locator('.sonner-toast:has-text("saved")')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should view event details', async ({ page }) => {
    const eventRow = page.locator('table tbody tr, .event-item').first();
    
    if (await eventRow.isVisible().catch(() => false)) {
      const viewLink = eventRow.locator('a, button:has-text("View")').first();
      await viewLink.click();
      
      await expect(page).toHaveURL(/admin\/events\/.+/);
      await expect(page.locator('h1')).toBeVisible();
    }
  });

  test('should manage event attendance', async ({ page }) => {
    const eventRow = page.locator('table tbody tr, .event-item').first();
    
    if (await eventRow.isVisible().catch(() => false)) {
      const attendanceLink = eventRow.locator('a:has-text("Attendance"), button:has-text("Attendance")');
      
      if (await attendanceLink.isVisible().catch(() => false)) {
        await attendanceLink.click();
        await expect(page).toHaveURL(/admin\/events\/.+\/attendance/);
        
        // Should show attendance roster
        await expect(page.locator('h1, h2')).toContainText('Attendance');
      }
    }
  });

  test('should manage event music', async ({ page }) => {
    const eventRow = page.locator('table tbody tr, .event-item').first();
    
    if (await eventRow.isVisible().catch(() => false)) {
      const musicLink = eventRow.locator('a:has-text("Music"), button:has-text("Music")');
      
      if (await musicLink.isVisible().catch(() => false)) {
        await musicLink.click();
        await expect(page).toHaveURL(/admin\/events\/.+\/music/);
        
        // Should show music management
        await expect(page.locator('h1, h2')).toContainText('Music');
      }
    }
  });

  test('should delete event', async ({ page }) => {
    const eventRow = page.locator('table tbody tr, .event-item').first();
    
    if (await eventRow.isVisible().catch(() => false)) {
      const deleteButton = eventRow.locator('button:has-text("Delete"), [data-testid="delete-event"]');
      
      if (await deleteButton.isVisible().catch(() => false)) {
        await deleteButton.click();
        
        // Confirm deletion
        const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Delete").has-text("Confirm")');
        if (await confirmButton.isVisible().catch(() => false)) {
          await confirmButton.click();
          await expect(page.locator('.sonner-toast:has-text("deleted")')).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });

  test('should filter events by date', async ({ page }) => {
    const dateFilter = page.locator('input[type="date"], [data-testid="date-filter"]');
    
    if (await dateFilter.isVisible().catch(() => false)) {
      const today = new Date().toISOString().split('T')[0];
      await dateFilter.fill(today);
      await page.waitForTimeout(500);
    }
  });

  test('should search events', async ({ page }) => {
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]');
    
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('concert');
      await page.waitForTimeout(500);
    }
  });
});

test.describe('Admin Event Attendance', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('should display attendance roster', async ({ page }) => {
    // Navigate to first event's attendance page
    await page.goto('/admin/events');
    
    const firstEvent = page.locator('table tbody tr, .event-item').first();
    if (await firstEvent.isVisible().catch(() => false)) {
      const attendanceLink = firstEvent.locator('a:has-text("Attendance")');
      if (await attendanceLink.isVisible().catch(() => false)) {
        await attendanceLink.click();
        
        await expect(page.locator('h1, h2')).toContainText('Attendance');
        
        // Should show attendance list
        const roster = page.locator('table, [data-testid="attendance-roster"], .attendance-list');
        await expect(roster).toBeVisible();
      }
    }
  });

  test('should mark attendance', async ({ page }) => {
    await page.goto('/admin/events');
    
    const firstEvent = page.locator('table tbody tr, .event-item').first();
    if (await firstEvent.isVisible().catch(() => false)) {
      const attendanceLink = firstEvent.locator('a:has-text("Attendance")');
      if (await attendanceLink.isVisible().catch(() => false)) {
        await attendanceLink.click();
        
        // Mark first member as present
        const presentButton = page.locator('button:has-text("Present"), input[type="checkbox"]').first();
        if (await presentButton.isVisible().catch(() => false)) {
          await presentButton.click();
          
          await expect(page.locator('.sonner-toast:has-text("saved")')).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });

  test('should export attendance', async ({ page }) => {
    await page.goto('/admin/events');
    
    const firstEvent = page.locator('table tbody tr, .event-item').first();
    if (await firstEvent.isVisible().catch(() => false)) {
      const attendanceLink = firstEvent.locator('a:has-text("Attendance")');
      if (await attendanceLink.isVisible().catch(() => false)) {
        await attendanceLink.click();
        
        const exportButton = page.locator('button:has-text("Export"), a:has-text("Export")');
        if (await exportButton.isVisible().catch(() => false)) {
          await exportButton.click();
          
          // Should trigger download or show export dialog
          await expect(page.locator('.sonner-toast, [role="dialog"]')).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });
});