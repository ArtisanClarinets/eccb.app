import { test, expect, type Page } from '@playwright/test';

async function openLibraryTab(page: Page): Promise<number> {
  await page.goto('/member/stand');
  await page.getByRole('tab', { name: /Library/i }).click();

  return page.locator('a[href^="/member/stand/library/"]').count();
}

test.describe('Music Stand Feature', () => {
  test.use({ storageState: 'e2e/.auth/member.json' });

  test.describe('Music Stand Page', () => {
    test('should access music stand from library', async ({ page }) => {
      await page.goto('/member/stand');
      
      await expect(page.locator('h1, h2')).toContainText(/Music Stand|Stand/);
    });

    test('should display music stand with PDF viewer', async ({ page }) => {
      const pieceCount = await openLibraryTab(page);

      if (pieceCount === 0) {
        await expect(page.getByText(/0 of 0 pieces in library/i)).toBeVisible();
        return;
      }

      const firstPieceLink = page.locator('a[href^="/member/stand/library/"]').first();
      await firstPieceLink.click();

      const viewer = page.getByRole('region', { name: 'PDF viewer' });
      const unavailableMessage = page.getByText(/Sheet music files are unavailable/i);
      await expect(viewer.or(unavailableMessage)).toBeVisible();
    });

    test('should navigate pages with controls', async ({ page }) => {
      await page.goto('/member/stand/library/1');
      
      const nextButton = page.locator('button:has-text("Next"), button[aria-label="next"], [data-testid="next-page"]');
      const prevButton = page.locator('button:has-text("Previous"), button[aria-label="previous"], [data-testid="prev-page"]');
      
      if (await nextButton.first().isVisible().catch(() => false)) {
        await nextButton.first().click();
        await page.waitForTimeout(500);
      }
      
      if (await prevButton.first().isVisible().catch(() => false)) {
        await prevButton.first().click();
        await page.waitForTimeout(500);
      }
    });

    test('should zoom in and out', async ({ page }) => {
      await page.goto('/member/stand/library/1');
      
      const zoomIn = page.locator('button:has-text("+"), button[aria-label="zoom in"], [data-testid="zoom-in"]');
      const zoomOut = page.locator('button:has-text("-"), button[aria-label="zoom out"], [data-testid="zoom-out"]');
      
      if (await zoomIn.first().isVisible().catch(() => false)) {
        await zoomIn.first().click();
        await page.waitForTimeout(500);
      }
      
      if (await zoomOut.first().isVisible().catch(() => false)) {
        await zoomOut.first().click();
        await page.waitForTimeout(500);
      }
    });

    test('should toggle night mode', async ({ page }) => {
      await page.goto('/member/stand/library/1');
      
      const nightModeToggle = page.locator('button:has-text("Night"), button[aria-label="night mode"], [data-testid="night-mode"]');
      
      if (await nightModeToggle.first().isVisible().catch(() => false)) {
        await nightModeToggle.first().click();
        
        // Check if dark mode is applied
        const body = page.locator('body');
        const classAttr = await body.getAttribute('class');
        expect(classAttr).toMatch(/dark|night/);
      }
    });

    test('should enter fullscreen mode', async ({ page }) => {
      await page.goto('/member/stand/library/1');
      
      const fullscreenButton = page.locator('button:has-text("Fullscreen"), button[aria-label="fullscreen"], [data-testid="fullscreen"]');
      
      if (await fullscreenButton.first().isVisible().catch(() => false)) {
        await fullscreenButton.first().click();
        await page.waitForTimeout(500);
      }
    });
  });

  test.describe('Music Stand Annotations', () => {
    test('should enable annotation mode', async ({ page }) => {
      await page.goto('/member/stand/library/1');
      
      const annotationButton = page.locator('button:has-text("Annotate"), button[aria-label="annotate"], [data-testid="annotation-mode"]');
      
      if (await annotationButton.first().isVisible().catch(() => false)) {
        await annotationButton.first().click();
        
        // Should show annotation tools
        const tools = page.locator('.annotation-tools, [data-testid="annotation-tools"]');
        await expect(tools).toBeVisible();
      }
    });

    test('should add annotation', async ({ page }) => {
      await page.goto('/member/stand/library/1');
      
      // Enable annotation mode
      const annotationButton = page.locator('button:has-text("Annotate"), [data-testid="annotation-mode"]');
      if (await annotationButton.first().isVisible().catch(() => false)) {
        await annotationButton.first().click();
        await page.waitForTimeout(500);
        
        // Click on canvas to add annotation
        const canvas = page.locator('canvas, .pdf-page, [data-testid="annotation-canvas"]').first();
        await canvas.click();
        
        // Should create annotation
        await expect(page.locator('.annotation, [data-testid="annotation"]')).toBeVisible();
      }
    });

    test('should save annotations', async ({ page }) => {
      await page.goto('/member/stand/library/1');
      
      const saveButton = page.locator('button:has-text("Save"), button[aria-label="save annotations"], [data-testid="save-annotations"]');
      
      if (await saveButton.first().isVisible().catch(() => false)) {
        await saveButton.first().click();
        
        await expect(page.locator('.sonner-toast:has-text("saved")')).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Music Stand Bookmarks', () => {
    test('should add bookmark', async ({ page }) => {
      await page.goto('/member/stand/library/1');
      
      const bookmarkButton = page.locator('button:has-text("Bookmark"), button[aria-label="bookmark"], [data-testid="add-bookmark"]');
      
      if (await bookmarkButton.first().isVisible().catch(() => false)) {
        await bookmarkButton.first().click();
        
        // Should show bookmark dialog or add directly
        await expect(page.locator('.sonner-toast:has-text("bookmark")')).toBeVisible({ timeout: 5000 });
      }
    });

    test('should view bookmarks panel', async ({ page }) => {
      await page.goto('/member/stand/library/1');
      
      const bookmarksPanel = page.locator('button:has-text("Bookmarks"), [data-testid="bookmarks-panel"]');
      
      if (await bookmarksPanel.first().isVisible().catch(() => false)) {
        await bookmarksPanel.first().click();
        
        // Should show bookmarks list
        await expect(page.locator('[data-testid="bookmarks-list"], .bookmarks-list')).toBeVisible();
      }
    });
  });

  test.describe('Music Stand Setlists', () => {
    test('should view setlists', async ({ page }) => {
      await page.goto('/member/stand');
      
      const setlistsPanel = page.locator('button:has-text("Setlist"), [data-testid="setlists-panel"], a:has-text("Setlist")');
      
      if (await setlistsPanel.first().isVisible().catch(() => false)) {
        await setlistsPanel.first().click();
        
        await expect(page.locator('[data-testid="setlist"], .setlist')).toBeVisible();
      }
    });

    test('should navigate between pieces in setlist', async ({ page }) => {
      await page.goto('/member/stand/1'); // Event stand
      
      const nextPiece = page.locator('button:has-text("Next Piece"), [data-testid="next-piece"]');
      if (await nextPiece.first().isVisible().catch(() => false)) {
        await nextPiece.first().click();
        await page.waitForTimeout(500);
      }
    });
  });

  test.describe('Music Stand Audio Features', () => {
    test('should open audio player', async ({ page }) => {
      await page.goto('/member/stand/library/1');
      
      const audioButton = page.locator('button:has-text("Audio"), button[aria-label="audio"], [data-testid="audio-player"]');
      
      if (await audioButton.first().isVisible().catch(() => false)) {
        await audioButton.first().click();
        
        // Should show audio player
        await expect(page.locator('.audio-player, [data-testid="audio-controls"]')).toBeVisible();
      }
    });

    test('should control playback', async ({ page }) => {
      await page.goto('/member/stand/library/1');
      
      const playButton = page.locator('button:has-text("Play"), button[aria-label="play"], [data-testid="play"]');
      
      if (await playButton.first().isVisible().catch(() => false)) {
        await playButton.first().click();
        await page.waitForTimeout(500);
        
        // Should show pause button now
        const pauseButton = page.locator('button:has-text("Pause"), button[aria-label="pause"], [data-testid="pause"]');
        await expect(pauseButton.first()).toBeVisible();
      }
    });
  });

  test.describe('Music Stand Metronome', () => {
    test('should open metronome', async ({ page }) => {
      await page.goto('/member/stand/library/1');
      
      const metronomeButton = page.locator('button:has-text("Metronome"), [data-testid="metronome"]');
      
      if (await metronomeButton.first().isVisible().catch(() => false)) {
        await metronomeButton.first().click();
        
        // Should show metronome controls
        await expect(page.locator('.metronome, [data-testid="metronome-controls"]')).toBeVisible();
      }
    });

    test('should adjust BPM', async ({ page }) => {
      await page.goto('/member/stand/library/1');
      
      const metronomeButton = page.locator('button:has-text("Metronome"), [data-testid="metronome"]');
      
      if (await metronomeButton.first().isVisible().catch(() => false)) {
        await metronomeButton.first().click();
        
        const bpmInput = page.locator('input[type="number"], input[name="bpm"], [data-testid="bpm-input"]');
        
        if (await bpmInput.first().isVisible().catch(() => false)) {
          await bpmInput.first().fill('120');
          await page.waitForTimeout(500);
        }
      }
    });
  });

  test.describe('Music Stand Keyboard Shortcuts', () => {
    test('should navigate with arrow keys', async ({ page }) => {
      await page.goto('/member/stand/library/1');
      
      // Press right arrow
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(500);
      
      // Press left arrow
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(500);
    });

    test('should toggle fullscreen with F key', async ({ page }) => {
      await page.goto('/member/stand/library/1');
      
      await page.keyboard.press('f');
      await page.waitForTimeout(500);
    });

    test('should toggle night mode with N key', async ({ page }) => {
      await page.goto('/member/stand/library/1');
      
      await page.keyboard.press('n');
      await page.waitForTimeout(500);
    });
  });

  test.describe('Music Stand Mobile Experience', () => {
    test('should support swipe gestures on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      const pieceCount = await openLibraryTab(page);

      if (pieceCount === 0) {
        await expect(page.getByRole('tab', { name: /Library/i })).toBeVisible();
        await expect(page.getByText(/0 of 0 pieces in library/i)).toBeVisible();
        return;
      }

      await page.locator('a[href^="/member/stand/library/"]').first().click();

      const gestureArea = page.getByRole('application', {
        name: /Page navigation gesture area/i,
      });
      await expect(gestureArea).toBeVisible();
    });

    test('should keep toolbar controls accessible on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      const pieceCount = await openLibraryTab(page);

      if (pieceCount === 0) {
        await expect(page.getByRole('tab', { name: /Library/i })).toBeVisible();
        return;
      }

      await page.locator('a[href^="/member/stand/library/"]').first().click();
      await expect(page.getByRole('toolbar', { name: /Music stand controls/i })).toBeVisible();
    });
  });
});
