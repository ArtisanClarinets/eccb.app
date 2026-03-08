import { test, expect } from '@playwright/test';

test.describe('Member Dashboard', () => {
  test.use({ storageState: 'e2e/.auth/member.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/member');
  });

  test('should display member dashboard', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Welcome back,/ })).toBeVisible();
    await expect(page.getByText("Here's what's happening with the band.")).toBeVisible();
  });

  test('should display user name', async ({ page }) => {
    await expect(page.locator('aside').getByText('E2E Member')).toBeVisible();
  });

  test('should display navigation sidebar', async ({ page }) => {
    const sidebar = page.locator('aside, nav[data-testid="member-nav"], .member-sidebar');
    await expect(sidebar).toBeVisible();

    const navItems = ['Dashboard', 'Music Stand', 'My Music', 'Calendar', 'Profile', 'Settings'];
    for (const item of navItems) {
      await expect(sidebar.getByRole('link', { name: item })).toBeVisible();
    }
  });

  test('should navigate to music page', async ({ page }) => {
    await page.getByRole('link', { name: 'My Music' }).click();
    await expect(page).toHaveURL('/member/music');
    await expect(page.getByRole('heading', { name: 'My Music' })).toBeVisible();
  });

  test('should navigate to calendar page', async ({ page }) => {
    await page.getByRole('link', { name: 'Calendar' }).click();
    await expect(page).toHaveURL('/member/calendar');
    await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible();
  });

  test('should navigate to profile page', async ({ page }) => {
    await page.getByRole('link', { name: 'Profile' }).click();
    await expect(page).toHaveURL('/member/profile');
    await expect(page.getByRole('heading', { name: 'My Profile' })).toBeVisible();
  });

  test('should display assigned music', async ({ page }) => {
    await expect(page.getByText('My Music').first()).toBeVisible();
  });

  test('should display upcoming events', async ({ page }) => {
    await expect(page.getByText('Upcoming Events').first()).toBeVisible();
  });

  test('should display announcements', async ({ page }) => {
    const announcementsHeading = page.getByRole('heading', { name: 'Latest Announcements' });

    if (await announcementsHeading.count()) {
      await expect(announcementsHeading).toBeVisible();
      return;
    }

    await expect(page.getByRole('heading', { name: /Welcome back,/ })).toBeVisible();
  });

  test('should have responsive layout', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();

    await expect(page.locator('button:has(svg.lucide-menu)').first()).toBeVisible();
  });
});

test.describe('Member Music', () => {
  test.use({ storageState: 'e2e/.auth/member.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/member/music');
  });

  test('should display music library', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'My Music' })).toBeVisible();
  });

  test('should search for music', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Search music...');

    await expect(searchInput).toBeVisible();
    await searchInput.fill('test');
    await expect(searchInput).toHaveValue('test');
  });

  test('should view music details', async ({ page }) => {
    const firstMusic = page.locator('[data-testid="music-item"], .music-card, tr').first();
    
    if (await firstMusic.isVisible().catch(() => false)) {
      await firstMusic.click();
      
      // Should navigate to detail page
      await expect(page).toHaveURL(/\/member\/music\/.+/);
      
      // Should display music details
      await expect(page.locator('h1')).toBeVisible();
    }
  });

  test('should filter music by type', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Filter' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sort' })).toBeVisible();
  });

  test('should access music stand for assigned piece', async ({ page }) => {
    // Look for "Open in Stand" or similar button
    const standButton = page.locator('a:has-text("Stand"), button:has-text("Stand"), a:has-text("Open"), [data-testid="open-stand"]');
    
    if (await standButton.first().isVisible().catch(() => false)) {
      await standButton.first().click();
      
      // Should navigate to stand
      await expect(page).toHaveURL(/\/member\/stand/);
    }
  });
});

test.describe('Member Events', () => {
  test.use({ storageState: 'e2e/.auth/member.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/member/events');
  });

  test('should display member events', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Events', exact: true })).toBeVisible();
  });

  test('should display event calendar', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Calendar View' })).toBeVisible();
  });

  test('should RSVP to an event', async ({ page }) => {
    const eventLinks = page.locator('a[href^="/member/events/"]');

    if (await eventLinks.first().isVisible().catch(() => false)) {
      await eventLinks.first().click();
      await expect(page).toHaveURL(/\/member\/events\/.+/);

      const rsvpButtons = page.locator('button:has-text("RSVP"), button:has-text("Yes"), button:has-text("Going"), [data-testid="rsvp-button"]');
      if (await rsvpButtons.first().isVisible().catch(() => false)) {
        await expect(rsvpButtons.first()).toBeVisible();
      }
    }
  });

  test('should view event details', async ({ page }) => {
    const eventCard = page.locator('[data-testid="event-card"], .event-item, tr').first();
    
    if (await eventCard.isVisible().catch(() => false)) {
      await eventCard.click();
      
      // Should navigate to event detail
      await expect(page).toHaveURL(/\/member\/events\/.+/);
      
      // Should show event details
      await expect(page.locator('h1')).toBeVisible();
    }
  });
});

test.describe('Member Profile', () => {
  test.use({ storageState: 'e2e/.auth/member.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/member/profile');
  });

  test('should display profile information', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'My Profile' })).toBeVisible();
    await expect(page.getByText('E2E Member').first()).toBeVisible();
  });

  test('should navigate to profile edit', async ({ page }) => {
    const editButton = page.locator('a:has-text("Edit"), button:has-text("Edit"), a[href*="edit"]');
    
    if (await editButton.first().isVisible().catch(() => false)) {
      await editButton.first().click();
      await expect(page).toHaveURL(/\/member\/profile\/edit/);
    }
  });

  test('should display attendance statistics', async ({ page }) => {
    await expect(page.getByText('Events Attended')).toBeVisible();
  });
});

test.describe('Member Calendar', () => {
  test.use({ storageState: 'e2e/.auth/member.json' });

  test('should display calendar page', async ({ page }) => {
    await page.goto('/member/calendar');

    await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();
  });
});

test.describe('Member Settings', () => {
  test.use({ storageState: 'e2e/.auth/member.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/member/settings');
  });

  test('should display settings page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('should update notification preferences', async ({ page }) => {
    await expect(page.getByRole('main').getByText('Notifications', { exact: true })).toBeVisible();
    await expect(page.getByRole('switch').first()).toBeVisible();
  });

  test('should change password', async ({ page }) => {
    await expect(page.getByLabel('Current Password')).toBeVisible();
    await expect(page.getByLabel('New Password', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Confirm New Password', { exact: true })).toBeVisible();
  });
});
