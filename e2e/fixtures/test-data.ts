/**
 * Test Data Fixtures
 * 
 * Common test data used across E2E tests
 */

export const USERS = {
  admin: {
    email: 'e2e-admin@eccb.app',
    password: 'TestPass123!',
    name: 'E2E Admin',
    role: 'ADMIN',
  },
  user: {
    email: 'e2e-user@eccb.app',
    password: 'TestPass123!',
    name: 'E2E User',
    role: 'USER',
  },
  member: {
    email: 'e2e-member@eccb.app',
    password: 'TestPass123!',
    name: 'E2E Member',
    role: 'MEMBER',
    instrument: 'TRUMPET',
    section: 'BRASS',
  },
} as const;

export const EVENTS = {
  concert: {
    title: 'Spring Concert',
    description: 'Annual spring concert performance',
    location: 'Main Auditorium',
    type: 'CONCERT',
  },
  rehearsal: {
    title: 'Weekly Rehearsal',
    description: 'Regular practice session',
    location: 'Rehearsal Hall',
    type: 'REHEARSAL',
  },
} as const;

export const MUSIC = {
  symphony: {
    title: 'Symphony No. 9',
    composer: 'Ludwig van Beethoven',
    difficulty: 'ADVANCED',
    type: 'CONCERT',
  },
  march: {
    title: 'Stars and Stripes Forever',
    composer: 'John Philip Sousa',
    difficulty: 'MEDIUM',
    type: 'MARCH',
  },
} as const;

export const INVALID_DATA = {
  emails: [
    'invalid-email',
    'test@',
    '@example.com',
    'test..test@example.com',
    'test@example..com',
  ],
  passwords: [
    '123',  // Too short
    'password',  // Common
    '12345678',  // Sequential
    '',  // Empty
  ],
  sqlInjection: [
    "'; DROP TABLE users; --",
    "' OR '1'='1",
    "admin'--",
    "1' UNION SELECT * FROM users--",
    "'; DELETE FROM users; --",
  ],
  xssPayloads: [
    '<script>alert(1)</script>',
    'javascript:alert(1)',
    '<img src=x onerror=alert(1)>',
    'onload=alert(1)',
    '<svg onload=alert(1)>',
  ],
} as const;

export const BOUNDARY_VALUES = {
  password: {
    min: '12345678',  // 8 chars (minimum)
    max: 'a'.repeat(128),  // 128 chars (maximum)
    tooShort: '1234567',  // 7 chars (too short)
    tooLong: 'a'.repeat(129),  // 129 chars (too long)
  },
  text: {
    empty: '',
    singleChar: 'a',
    maxShort: 'a'.repeat(255),
    maxMedium: 'a'.repeat(1000),
    maxLong: 'a'.repeat(10000),
  },
  numbers: {
    negative: -1,
    zero: 0,
    one: 1,
    max: 2147483647,
    tooLarge: 999999999999999,
  },
} as const;

export const API_ENDPOINTS = {
  public: [
    '/api/health',
    '/api/auth/sign-in/email',
    '/api/auth/sign-up/email',
  ],
  protected: [
    '/api/members',
    '/api/events',
    '/api/music',
    '/api/stand/config',
  ],
  admin: [
    '/api/admin/users',
    '/api/admin/events',
    '/api/admin/music',
    '/api/admin/members',
  ],
} as const;

export const SELECTORS = {
  login: {
    email: 'input[name="email"]',
    password: 'input[name="password"]',
    submit: 'button[type="submit"]',
    error: '.sonner-toast',
  },
  navigation: {
    menu: 'nav',
    mobileMenu: 'button[aria-label="menu"]',
    userMenu: '[data-testid="user-menu"]',
    logout: 'a:has-text("Sign Out"), button:has-text("Sign Out")',
  },
  toast: {
    container: '.sonner-toast',
    success: '.sonner-toast:has-text("success")',
    error: '.sonner-toast:has-text("error")',
  },
  common: {
    loading: '[data-testid="loading"]',
    error: '[data-testid="error"]',
    empty: '[data-testid="empty"]',
  },
} as const;

export const TIMEOUTS = {
  short: 5000,
  medium: 15000,
  long: 30000,
  veryLong: 60000,
} as const;

export const VIEWPORTS = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 720 },
  wide: { width: 1920, height: 1080 },
} as const;

export const DATE_FORMATS = {
  iso: 'YYYY-MM-DD',
  display: 'MM/DD/YYYY',
  timestamp: 'YYYY-MM-DDTHH:mm:ssZ',
} as const;

export function generateTestUser(prefix: string = 'test') {
  const timestamp = Date.now();
  return {
    email: `${prefix}-${timestamp}@eccb.app`,
    password: 'TestPass123!',
    name: `Test ${prefix} User`,
  };
}

export function generateTestEvent(prefix: string = 'Event') {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return {
    title: `${prefix} ${Date.now()}`,
    description: `Test event description ${Date.now()}`,
    location: 'Test Location',
    startDate: tomorrow.toISOString().split('T')[0],
    startTime: '19:00',
    type: 'REHEARSAL',
  };
}

export function generateTestMusic(prefix: string = 'Piece') {
  return {
    title: `${prefix} ${Date.now()}`,
    composer: 'Test Composer',
    description: `Test music description ${Date.now()}`,
    difficulty: 'MEDIUM',
    type: 'CONCERT',
  };
}
