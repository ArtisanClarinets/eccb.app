# E2E Test Suite for ECCB Platform

This directory contains comprehensive end-to-end tests for the Emerald Coast Community Band (ECCB) Management Platform.

## Test Coverage

### Authentication (`auth/`)
- Login flow (valid/invalid credentials)
- Forgot password flow
- Signup flow
- Logout flow
- Protected routes
- Session management
- Rate limiting
- OAuth integration (Google)

### Public Pages (`public/`)
- Homepage
- About page
- Events page (listing and details)
- Contact page (form submission)
- Gallery page
- News page
- Sponsors page
- Policies page
- 404 error handling
- Accessibility (ARIA, headings, alt text)
- Performance testing

### Member Portal (`member/`)
- Dashboard
- Music library (search, filter, view)
- Events (RSVP, calendar, details)
- Profile (view, edit)
- Calendar
- Settings (notifications, password)

### Admin Panel (`admin/`)
- Dashboard and statistics
- User management (CRUD, ban/unban, impersonate)
- Roles and permissions
- Event management (CRUD, attendance)
- Music management (CRUD, archive, bulk operations)
- Member management

### Music Stand (`stand/`)
- PDF viewer
- Page navigation and zoom
- Night mode and fullscreen
- Annotations (create, edit, delete)
- Bookmarks
- Setlists
- Audio player
- Metronome
- Keyboard shortcuts
- Mobile gestures

### API Tests (`api/`)
- Health checks
- Authentication endpoints
- Events (CRUD, RSVP, attendance)
- Members (CRUD, export)
- Music (CRUD, assignments)
- Stand (preferences, annotations, bookmarks)
- Settings
- Smart Upload
- Edge cases and error handling

## Running Tests

### Setup

1. Install dependencies:
```bash
npm install
npx playwright install
```

2. Start the development server:
```bash
npm run dev
```

3. In another terminal, run the setup to create test users:
```bash
npx playwright test e2e/auth.setup.ts --project=setup
```

### Running All Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with UI mode for debugging
npm run test:e2e:ui

# Run specific test file
npx playwright test e2e/auth/login.spec.ts

# Run tests matching a pattern
npx playwright test --grep "login"

# Run on specific browser
npx playwright test --project=chromium

# Run with headed browser (visible)
npx playwright test --headed

# Run in debug mode
npx playwright test --debug
```

### Test Reports

After running tests, view the HTML report:
```bash
npx playwright show-report
```

Or view the JSON results:
```bash
cat e2e-results.json
```

## Test Data

Test users are automatically created during setup:
- **Admin**: `e2e-admin@eccb.app` / `TestPass123!`
- **User**: `e2e-user@eccb.app` / `TestPass123!`
- **Member**: `e2e-member@eccb.app` / `TestPass123!`

## Browser Support

Tests run on:
- Chrome (Desktop)
- Firefox (Desktop)
- Safari (Desktop)
- Mobile Chrome (Pixel 5)
- Mobile Safari (iPhone 12)
- iPad (Tablet)

## Configuration

The Playwright configuration is in `playwright.config.ts`:
- Base URL: `http://localhost:3000` (configurable via `PLAYWRIGHT_BASE_URL`)
- Test directory: `./e2e`
- Parallel execution: Enabled
- Retries: 2 in CI, 1 locally
- Timeout: 30 seconds per test

## Writing New Tests

1. Create a new `.spec.ts` file in the appropriate directory
2. Use the existing tests as templates
3. Follow the naming convention: `feature-name.spec.ts`
4. Group related tests with `test.describe`
5. Use `test.beforeEach` for common setup
6. Add assertions with `expect`

Example:
```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/feature');
  });

  test('should do something', async ({ page }) => {
    await page.click('button');
    await expect(page.locator('text=Success')).toBeVisible();
  });
});
```

## CI/CD Integration

Tests automatically run in CI with:
- Parallel execution disabled (workers: 1)
- 2 retries for flaky tests
- Screenshot and video on failure
- HTML and JSON reporting

## Troubleshooting

### Tests fail with "Browser not found"
Run: `npx playwright install`

### Tests fail with connection errors
Ensure the dev server is running: `npm run dev`

### Tests fail with timeout
Increase timeout in `playwright.config.ts` or use `test.setTimeout()`

### Tests fail on specific browser
Check browser-specific selectors or use browser-agnostic selectors

## Best Practices

1. **Use data-testid attributes** for reliable selectors
2. **Test user-visible behavior** not implementation details
3. **Handle async operations** with proper waiting
4. **Clean up after tests** when modifying data
5. **Use API for setup** when possible (faster than UI)
6. **Test both success and failure** cases
7. **Test accessibility** with proper ARIA checks
8. **Test on multiple viewports** for responsive design
