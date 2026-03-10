import { test, expect } from '@playwright/test';

test.describe('Public Pages', () => {
  test.describe('Homepage', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
    });

    test('should display homepage title and branding', async ({ page }) => {
      await expect(page.locator('h1')).toContainText('Emerald Coast');
      await expect(page.getByRole('link', { name: 'Emerald Coast Community Band' })).toBeVisible();
    });

    test('should display navigation menu', async ({ page }) => {
      const nav = page.locator('nav');
      await expect(nav).toBeVisible();
      
      // Check for common nav items
      const navItems = ['About', 'Events', 'Contact', 'Join Us'];
      for (const item of navItems) {
        await expect(nav.locator(`text=${item}`)).toBeVisible();
      }
    });

    test('should navigate to About page', async ({ page }) => {
      await page.getByRole('navigation').getByRole('link', { name: 'About' }).click();
      await expect(page).toHaveURL('/about');
      await expect(page.getByRole('heading', { name: 'About the Band' })).toBeVisible();
    });

    test('should navigate to Events page', async ({ page }) => {
      await page.getByRole('navigation').getByRole('link', { name: 'Events' }).click();
      await expect(page).toHaveURL('/events');
      await expect(page.getByRole('heading', { name: 'Events & Concerts' })).toBeVisible();
    });

    test('should navigate to Contact page', async ({ page }) => {
      await page.getByRole('navigation').getByRole('link', { name: 'Contact' }).click();
      await expect(page).toHaveURL('/contact');
      await expect(page.getByRole('heading', { name: 'Contact Us' })).toBeVisible();
    });

    test('should display hero section with CTA', async ({ page }) => {
      const hero = page.locator('section').first();
      await expect(hero).toBeVisible();
      
      // Check for CTA buttons
      const ctaButtons = page.locator('a[href="/signup"], button:has-text("Join"), a:has-text("Join")');
      if (await ctaButtons.count() > 0) {
        await expect(ctaButtons.first()).toBeVisible();
      }
    });

    test('should display upcoming events section', async ({ page }) => {
      const upcomingHeading = page.getByRole('heading', { name: 'UPCOMING PERFORMANCES' });

      if (await upcomingHeading.count()) {
        await expect(upcomingHeading).toBeVisible();
        return;
      }

      await expect(page.getByRole('heading', { name: /Ready to/ })).toBeVisible();
    });

    test('should have working login link', async ({ page }) => {
      const loginLink = page.locator('a[href="/login"], a:has-text("Sign In"), a:has-text("Login")');
      if (await loginLink.isVisible().catch(() => false)) {
        await loginLink.click();
        await expect(page).toHaveURL('/login');
      }
    });

    test('should be responsive on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.reload();

      await expect(page.getByRole('button', { name: 'Toggle navigation' })).toBeVisible();
    });

    test('should have proper meta tags', async ({ page }) => {
      const title = await page.title();
      expect(title).toContain('Emerald Coast');
      
      const description = page.locator('meta[name="description"]');
      await expect(description).toHaveAttribute('content', /.+/);
    });

    test('should display footer with links', async ({ page }) => {
      const footer = page.locator('footer');
      await expect(footer).toBeVisible();
      
      // Footer should have copyright
      await expect(footer.locator('text=©')).toBeVisible();
    });
  });

  test.describe('About Page', () => {
    test('should display about content', async ({ page }) => {
      await page.goto('/about');

      await expect(page.getByRole('heading', { name: 'About the Band' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Our Mission' })).toBeVisible();
    });

    test('should display directors section', async ({ page }) => {
      await page.goto('/directors');

      await expect(page.getByRole('heading', { name: 'Our Leadership', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Music Directors' })).toBeVisible();
    });
  });

  test.describe('Events Page', () => {
    test('should display events list', async ({ page }) => {
      await page.goto('/events');

      await expect(page.getByRole('heading', { name: 'Events & Concerts' })).toBeVisible();

      const events = page.locator('a[href^="/events/"]');
      const emptyState = page.getByRole('heading', { name: 'No Upcoming Events' });

      expect((await events.count()) > 0 || await emptyState.isVisible().catch(() => false)).toBeTruthy();
    });

    test('should show upcoming events section', async ({ page }) => {
      await page.goto('/events');

      await expect(page.getByRole('heading', { name: 'Upcoming Events', exact: true })).toBeVisible();
    });

    test('should display individual event details', async ({ page }) => {
      await page.goto('/events');

      const firstEvent = page.locator('a[href^="/events/"]').first();
      if (await firstEvent.isVisible().catch(() => false)) {
        await firstEvent.click();

        await expect(page).toHaveURL(/\/events\/.+/);
        await expect(page.locator('h1')).toBeVisible();
      }
    });
  });

  test.describe('Contact Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/contact');
    });

    test('should display contact form', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Contact Us' })).toBeVisible();
      await expect(page.getByLabel('Name')).toBeVisible();
      await expect(page.getByLabel('Email')).toBeVisible();
      await expect(page.getByLabel('Message')).toBeVisible();
    });

    test('should display contact form controls', async ({ page }) => {
      await expect(page.locator('#subject')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Send Message' })).toBeVisible();
    });

    test('should allow entering contact form data', async ({ page }) => {
      await page.getByLabel('Name').fill('Test User');
      await page.getByLabel('Email').fill('test@example.com');
      await page.locator('#subject').click();
      await page.getByRole('option', { name: 'General Inquiry' }).click();
      await page.getByLabel('Message').fill('This is a test message for the contact form.');

      await expect(page.getByLabel('Name')).toHaveValue('Test User');
      await expect(page.getByLabel('Email')).toHaveValue('test@example.com');
      await expect(page.getByLabel('Message')).toHaveValue('This is a test message for the contact form.');
    });
  });

  test.describe('Gallery Page', () => {
    test('should display gallery', async ({ page }) => {
      await page.goto('/gallery');

      await expect(page.getByRole('heading', { name: 'Photo Gallery' })).toBeVisible();

      // ensure at least one image is visible in each tab
      const tabs = ['Concerts', 'Rehearsals', 'Community Events'];
      for (const tab of tabs) {
        await page.getByRole('tab', { name: tab }).click();
        // wait for potential images to load
        await page.waitForTimeout(200);
        const imgs = page.locator('img');
        const count = await imgs.count();
        expect(count).toBeGreaterThan(0);
      }
    });
  });

  test.describe('News Page', () => {
    test('should display news/announcements', async ({ page }) => {
      await page.goto('/news');

      await expect(page.getByRole('heading', { name: 'News & Updates' })).toBeVisible();
    });
  });

  test.describe('Sponsors Page', () => {
    test('should display sponsors', async ({ page }) => {
      await page.goto('/sponsors');

      await expect(page.getByRole('heading', { name: 'Our Sponsors' })).toBeVisible();
    });
  });

  test.describe('Policies Page', () => {
    test('should display policies', async ({ page }) => {
      await page.goto('/policies');

      await expect(page.getByRole('heading', { name: 'Policies & FAQ' })).toBeVisible();
    });
  });

  test.describe('404 Page', () => {
    test('should display custom 404 page', async ({ page }) => {
      await page.goto('/non-existent-page-12345');

      await expect(page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Return Home' })).toBeVisible();
    });

    test('should navigate home from 404', async ({ page }) => {
      await page.goto('/non-existent-page');

      await page.getByRole('link', { name: 'Return Home' }).click();
      await expect(page).toHaveURL('/');
    });
  });

  test.describe('Accessibility', () => {
    test('should have proper heading hierarchy', async ({ page }) => {
      await page.goto('/');
      
      const h1 = page.locator('h1');
      await expect(h1).toHaveCount(1);
    });

    test('should have alt text on images', async ({ page }) => {
      await page.goto('/');
      
      const images = page.locator('img');
      const count = await images.count();
      
      for (let i = 0; i < Math.min(count, 10); i++) {
        const img = images.nth(i);
        const alt = await img.getAttribute('alt');
        const ariaHidden = await img.getAttribute('aria-hidden');
        
        // Should have alt text or be aria-hidden
        expect(alt || ariaHidden).toBeTruthy();
      }
    });

    test('should have focusable interactive elements', async ({ page }) => {
      await page.goto('/');
      
      // Check that links are focusable
      const firstLink = page.locator('a').first();
      await firstLink.focus();
      await expect(firstLink).toBeFocused();
    });

    test('should have proper ARIA labels', async ({ page }) => {
      await page.goto('/');
      
      // Navigation should have aria-label or role
      const nav = page.locator('nav');
      const ariaLabel = await nav.getAttribute('aria-label');
      const role = await nav.getAttribute('role');
      
      expect(ariaLabel || role).toBeTruthy();
    });
  });

  test.describe('Performance', () => {
    test('should load within acceptable time', async ({ page }) => {
      const startTime = Date.now();
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;
      
      expect(loadTime).toBeLessThan(5000); // Should load within 5 seconds
    });

    test('should not have console errors', async ({ page }) => {
      const errors: string[] = [];
      
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        }
      });
      
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      // Filter out expected errors
      const criticalErrors = errors.filter(e => 
        !e.includes('favicon') && 
        !e.includes('source map')
      );
      
      expect(criticalErrors).toHaveLength(0);
    });
  });
});
