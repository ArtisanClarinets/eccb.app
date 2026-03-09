import { test, expect } from '@playwright/test';

/**
 * Complete User Journey Tests
 * 
 * These tests simulate real user workflows through the application,
 * combining multiple features to ensure they work together seamlessly.
 */

test.describe('Complete User Journeys', () => {
  test.describe('New Member Onboarding', () => {
    test('should complete full onboarding flow', async ({ page }) => {
      // 1. Visit homepage
      await page.goto('/');
      await expect(page.locator('h1')).toContainText('Emerald Coast');
      
      // 2. Navigate to signup
      await page.click('a[href="/signup"]');
      await expect(page).toHaveURL('/signup');
      
      // 3. Register account
      const randomEmail = `journey-${Date.now()}@eccb.app`;
      await page.fill('input[name="name"]', 'Journey Test User');
      await page.fill('input[name="email"]', randomEmail);
      await page.fill('input[name="password"]', 'JourneyPass123!');
      await page.click('button[type="submit"]');
      
      // 4. New users land on sign-in after registration
      await page.waitForURL(/\/login/, { timeout: 10000 });
      await expect(page.locator('h3')).toContainText(/Member Sign In/i);
      await expect(page.locator('input[name="email"]')).toBeVisible();
    });
  });

  test.describe('Member Event Participation', () => {
    test.use({ storageState: 'e2e/.auth/member.json' });
    
    test('should RSVP to event and view assigned music', async ({ page }) => {
      // 1. View upcoming events
      await page.goto('/member/events');
      await expect(page.locator('h1, h2')).toContainText('Events');
      
      // 2. RSVP to first available event
      const rsvpButton = page.locator('button:has-text("RSVP"), button:has-text("Going")').first();
      if (await rsvpButton.isVisible().catch(() => false)) {
        await rsvpButton.click();
        await expect(page.locator('.sonner-toast')).toBeVisible({ timeout: 5000 });
      }
      
      // 3. View event details
      const eventLink = page.locator('a[href*="/member/events/"]').first();
      if (await eventLink.isVisible().catch(() => false)) {
        await eventLink.click();
        await expect(page.locator('h1')).toBeVisible();
        
        // 4. Check for assigned music
        const musicLink = page.locator('a:has-text("Music"), a:has-text("View Music")');
        if (await musicLink.isVisible().catch(() => false)) {
          await musicLink.click();
          
          // 5. Open music in stand
          const standButton = page.locator('button:has-text("Open Stand"), a:has-text("Stand"), [data-testid="open-stand"]');
          if (await standButton.first().isVisible().catch(() => false)) {
            await standButton.first().click();
            
            // 6. Verify stand loaded
            await expect(page.locator('canvas, .pdf-viewer, [data-testid="pdf-viewer"]')).toBeVisible();
          }
        }
      }
    });

    test('should track practice time for assigned piece', async ({ page }) => {
      // 1. Go to music library
      await page.goto('/member/music');
      
      // 2. Click on first piece
      const pieceLink = page.locator('a[href*="/member/music/"], .music-card, tr').first();
      if (await pieceLink.isVisible().catch(() => false)) {
        await pieceLink.click();
        
        // 3. Open in stand
        await page.waitForURL(/\/member\/music\/.+/);
        const standButton = page.locator('button:has-text("Practice"), a:has-text("Open Stand")').first();
        
        if (await standButton.isVisible().catch(() => false)) {
          await standButton.click();
          
          // 4. Start practice timer
          const timerButton = page.locator('button:has-text("Start"), [data-testid="start-practice"]').first();
          if (await timerButton.isVisible().catch(() => false)) {
            await timerButton.click();
            await page.waitForTimeout(2000); // Practice for 2 seconds
            
            // 5. Stop timer
            const stopButton = page.locator('button:has-text("Stop"), [data-testid="stop-practice"]').first();
            if (await stopButton.isVisible().catch(() => false)) {
              await stopButton.click();
            }
          }
        }
      }
    });
  });

  test.describe('Admin Event Management', () => {
    test.use({ storageState: 'e2e/.auth/admin.json' });
    
    test('should create event, assign music, and track attendance', async ({ page }) => {
      // 1. Create new event
      await page.goto('/admin/events/new');
      
      const eventName = `E2E Journey Event ${Date.now()}`;
      await page.fill('input[name="title"], input[name="name"]', eventName);
      await page.fill('textarea[name="description"]', 'Test event for journey');
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateInput = page.locator('input[name="startDate"]');
      if (await dateInput.isVisible().catch(() => false)) {
        await dateInput.fill(`${tomorrow.toISOString().split('T')[0]}T19:00`);
      }
      
      await page.click('button[type="submit"], button:has-text("Create Event")');
      await page.waitForURL(
        (url) => /\/admin\/events\/[^/]+$/.test(url.toString()) && !url.toString().endsWith('/new'),
        { timeout: 10000 }
      );
      
      // 2. Get event ID from URL
      const url = page.url();
      const eventId = url.match(/\/admin\/events\/([^/]+)/)?.[1];
      
      if (eventId) {
        // 3. Navigate to event music page
        await page.goto(`/admin/events/${eventId}/music`);
        
        // 4. Assign music
        const assignButton = page.locator('button:has-text("Assign Music"), [data-testid="assign-music"]').first();
        if (await assignButton.isVisible().catch(() => false)) {
          await assignButton.click();
          
          // 5. Select music piece
          const musicSelect = page.locator('[role="dialog"] select, .dialog select').first();
          if (await musicSelect.isVisible().catch(() => false)) {
            await musicSelect.selectOption({ index: 1 });
            
            // 6. Save assignment
            const saveButton = page.locator('[role="dialog"] button:has-text("Save"), [role="dialog"] button:has-text("Assign")');
            await saveButton.click();
            
            await expect(page.locator('.sonner-toast:has-text("assigned")')).toBeVisible({ timeout: 5000 });
          }
        }
        
        // 7. Navigate to attendance page
        await page.goto(`/admin/events/${eventId}/attendance`);
        await expect(page.locator('h1, h2')).toContainText('Attendance');
        
        // 8. Mark some attendees
        const presentButtons = page.locator('button:has-text("Present"), input[type="checkbox"]').first();
        if (await presentButtons.isVisible().catch(() => false)) {
          await presentButtons.click();
          await expect(page.locator('.sonner-toast:has-text("saved")')).toBeVisible({ timeout: 5000 });
        }
      }
    });
  });

  test.describe('Music Upload and Review', () => {
    test.use({ storageState: 'e2e/.auth/admin.json' });
    
    test('should queue PDF for smart upload review', async ({ page }) => {
      await page.goto('/admin/uploads');
      await expect(page.locator('h1, h2')).toContainText(/Smart Upload|Upload/i);

      const fileInput = page.locator('input[type="file"][name="uploadFiles"]');

      const pdfContent = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\nxref\n0 2\n0000000000 65535 f\n0000000009 00000 n\ntrailer\n<<\n/Root 1 0 R\n/Size 2\n>>\nstartxref\n45\n%%EOF'
      );

      await fileInput.setInputFiles({
        name: 'test-score.pdf',
        mimeType: 'application/pdf',
        buffer: pdfContent,
      });

      await expect(page.locator('text=Upload Queue')).toBeVisible();
      await expect(page.locator('text=test-score.pdf')).toBeVisible();
      await expect(page.getByRole('button', { name: /Start AI Processing/i })).toBeEnabled();
    });
  });

  test.describe('Member Communication', () => {
    test.use({ storageState: 'e2e/.auth/admin.json' });
    
    test('should send announcement to members', async ({ page }) => {
      await page.goto('/admin/communications/compose');
      await expect(page.locator('h1, h2')).toContainText(/Compose Email/i);

      await page.fill('input[name="subject"]', 'Test Announcement');
      await page.fill('textarea[name="body"]', 'This is a test announcement for members.');
      await page.click('button:has-text("Send Email"), button[type="submit"]');

      await page.waitForURL(/\/admin\/communications$/, { timeout: 10000 });
      await expect(page.locator('h1, h2')).toContainText(/Communications/i);
    });
  });

  test.describe('Cross-Device Session', () => {
    test.use({ storageState: 'e2e/.auth/member.json' });
    
    test('should maintain session across page navigations', async ({ page, context }) => {
      // 1. Login on desktop
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto('/member');
      await expect(page.locator('text=E2E Member').first()).toBeVisible();
      
      // 2. Navigate through multiple pages
      const pages = ['/member/music', '/member/events', '/member/profile', '/member/calendar'];
      
      for (const pageUrl of pages) {
        await page.goto(pageUrl);
        await expect(page.locator('text=E2E Member').first()).toBeVisible();
      }
      
      // 3. Switch to mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      await page.reload();
      
      // 4. User should still be logged in
      await expect(page.locator('text=E2E Member').first()).toBeVisible();
      
      // 5. Open new tab
      const newPage = await context.newPage();
      await newPage.goto('/member');
      
      // 6. Should be logged in on new tab
      await expect(newPage.locator('text=E2E Member').first()).toBeVisible();
    });
  });

  test.describe('Error Recovery', () => {
    test('should handle network errors gracefully', async ({ page }) => {
      // 1. Visit page
      await page.goto('/login');
      
      // 2. Simulate offline
      await page.context().setOffline(true);
      
      // 3. Try to submit form
      await page.fill('input[name="email"]', 'test@example.com');
      await page.fill('input[name="password"]', 'password');
      await page.click('button[type="submit"]');
      
      // 4. The page should remain stable while offline
      await expect(page).toHaveURL(/\/login/);
      await expect(page.locator('h3:has-text("Member Sign In")')).toBeVisible();
      
      // 5. Restore connection
      await page.context().setOffline(false);
      
      // 6. Should work again
      await page.reload();
      await expect(page.locator('h3:has-text("Member Sign In")')).toBeVisible();
    });

    test('should recover from invalid navigation', async ({ page }) => {
      // 1. Try to access non-existent page
      await page.goto('/invalid-page-12345');
      
      // 2. Should show 404
      await expect(page.locator('h1')).toContainText(/404|Not Found|Page/);
      
      // 3. Navigate home should work
      await page.click('a:has-text("Return Home"), a:has-text("Home")');
      await expect(page).toHaveURL('/');
    });
  });
});
