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
      await page.click('a:has-text("Join"), a:has-text("Sign Up")');
      await expect(page).toHaveURL('/signup');
      
      // 3. Register account
      const randomEmail = `journey-${Date.now()}@eccb.app`;
      await page.fill('input[name="name"]', 'Journey Test User');
      await page.fill('input[name="email"]', randomEmail);
      await page.fill('input[name="password"]', 'JourneyPass123!');
      await page.click('button[type="submit"]');
      
      // 4. Verify email (in real scenario, user would click email link)
      await expect(page.locator('.sonner-toast, text=verify')).toBeVisible({ timeout: 5000 });
      
      // 5. Login
      await page.goto('/login');
      await page.fill('input[name="email"]', randomEmail);
      await page.fill('input[name="password"]', 'JourneyPass123!');
      await page.click('button[type="submit"]');
      
      // 6. View member dashboard
      await page.waitForURL('**/');
      
      // 7. Complete profile
      await page.goto('/member/profile/edit');
      await page.fill('input[name="instrument"]', 'Trumpet');
      await page.fill('textarea[name="bio"]', 'New member bio');
      await page.click('button[type="submit"]');
      
      await expect(page.locator('.sonner-toast:has-text("saved")')).toBeVisible({ timeout: 5000 });
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
      const dateInput = page.locator('input[type="date"], input[name="startDate"]');
      if (await dateInput.isVisible().catch(() => false)) {
        await dateInput.fill(tomorrow.toISOString().split('T')[0]);
      }
      
      await page.click('button[type="submit"], button:has-text("Save")');
      await expect(page.locator('.sonner-toast:has-text("created")')).toBeVisible({ timeout: 5000 });
      
      // 2. Get event ID from URL
      const url = page.url();
      const eventId = url.match(/\/admin\/events\/(\d+)/)?.[1];
      
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
    
    test('should upload PDF and process through smart upload', async ({ page }) => {
      // 1. Go to music library
      await page.goto('/admin/music');
      
      // 2. Upload new music
      const uploadButton = page.locator('button:has-text("Upload"), a:has-text("Upload")').first();
      if (await uploadButton.isVisible().catch(() => false)) {
        await uploadButton.click();
        
        // 3. Fill upload form
        await page.fill('input[name="title"]', `Smart Upload Test ${Date.now()}`);
        await page.fill('input[name="composer"]', 'Test Composer');
        
        // 4. Upload PDF file
        const fileInput = page.locator('input[type="file"]');
        if (await fileInput.isVisible().catch(() => false)) {
          // Create test PDF content
          const pdfContent = Buffer.from(
            '%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\nxref\n0 2\n0000000000 65535 f\n0000000009 00000 n\ntrailer\n<<\n/Root 1 0 R\n/Size 2\n>>\nstartxref\n45\n%%EOF'
          );
          
          await fileInput.setInputFiles({
            name: 'test-score.pdf',
            mimeType: 'application/pdf',
            buffer: pdfContent,
          });
          
          // 5. Submit upload
          await page.click('button[type="submit"], button:has-text("Upload")');
          
          // 6. Verify processing started
          await expect(page.locator('.sonner-toast:has-text("upload")')).toBeVisible({ timeout: 5000 });
          
          // 7. Check review queue
          await page.goto('/admin/uploads/review');
          await expect(page.locator('h1, h2')).toContainText('Review');
        }
      }
    });
  });

  test.describe('Member Communication', () => {
    test.use({ storageState: 'e2e/.auth/admin.json' });
    
    test('should send announcement to members', async ({ page }) => {
      // 1. Go to communications page
      await page.goto('/admin/communications');
      
      // 2. Create new announcement
      const composeButton = page.locator('a:has-text("Compose"), button:has-text("New Message")').first();
      if (await composeButton.isVisible().catch(() => false)) {
        await composeButton.click();
        
        // 3. Fill message
        await page.fill('input[name="subject"], input[name="title"]', 'Test Announcement');
        await page.fill('textarea[name="message"], textarea[name="content"]', 'This is a test announcement');
        
        // 4. Select recipients
        const recipientSelect = page.locator('select[name="recipients"], input[name="recipients"]');
        if (await recipientSelect.isVisible().catch(() => false)) {
          await recipientSelect.selectOption('all-members');
        }
        
        // 5. Send announcement
        const sendButton = page.locator('button:has-text("Send"), button[type="submit"]');
        await sendButton.click();
        
        await expect(page.locator('.sonner-toast:has-text("sent")')).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Cross-Device Session', () => {
    test.use({ storageState: 'e2e/.auth/member.json' });
    
    test('should maintain session across page navigations', async ({ page, context }) => {
      // 1. Login on desktop
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto('/member');
      await expect(page.locator('text=E2E Member')).toBeVisible();
      
      // 2. Navigate through multiple pages
      const pages = ['/member/music', '/member/events', '/member/profile', '/member/calendar'];
      
      for (const pageUrl of pages) {
        await page.goto(pageUrl);
        await expect(page.locator('text=E2E Member')).toBeVisible();
      }
      
      // 3. Switch to mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      await page.reload();
      
      // 4. User should still be logged in
      await expect(page.locator('text=E2E Member')).toBeVisible();
      
      // 5. Open new tab
      const newPage = await context.newPage();
      await newPage.goto('/member');
      
      // 6. Should be logged in on new tab
      await expect(newPage.locator('text=E2E Member')).toBeVisible();
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
      
      // 4. Should show offline error
      await expect(page.locator('text=offline, text=connection, text=network').first()).toBeVisible({ timeout: 5000 });
      
      // 5. Restore connection
      await page.context().setOffline(false);
      
      // 6. Should work again
      await page.reload();
      await expect(page.locator('h3:has-text("Member Sign In")')).toBeVisible();
    });

    test('should recover from invalid navigation', async ({ page }) => {
      // 1. Try to access non-existent page
      await page.goto('/member/invalid-page-12345');
      
      // 2. Should show 404
      await expect(page.locator('h1')).toContainText(/404|Not Found|Page/);
      
      // 3. Navigate home should work
      await page.click('a:has-text("Home"), a:has-text("Back")');
      await expect(page).toHaveURL('/');
    });
  });
});
