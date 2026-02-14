/**
 * Test Setup File
 * 
 * This file is run before each test file and sets up global test utilities,
 * mocks, and configurations.
 */

import { vi } from 'vitest';

// Set environment variables BEFORE any modules are imported
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/eccb_test';
process.env.REDIS_URL = 'redis://localhost:6379/15'; // Use Redis DB 15 for tests
process.env.AUTH_SECRET = 'test-secret-key-for-testing-min-32-chars';
process.env.BETTER_AUTH_SECRET = 'test-secret-key-for-testing-min-32-chars';
process.env.BETTER_AUTH_URL = 'http://localhost:3000';
process.env.AUTH_URL = 'http://localhost:3000';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
process.env.NEXT_PUBLIC_APP_NAME = 'ECCB Test';
process.env.STORAGE_DRIVER = 'LOCAL';
process.env.LOCAL_STORAGE_PATH = './storage/test';
process.env.S3_ENDPOINT = '';
process.env.S3_ACCESS_KEY_ID = '';
process.env.S3_SECRET_ACCESS_KEY = '';
process.env.S3_BUCKET_NAME = '';
process.env.S3_REGION = 'us-east-1';
process.env.S3_FORCE_PATH_STYLE = 'true';
process.env.EMAIL_DRIVER = 'LOG';
process.env.SMTP_FROM = 'noreply@eccb.app';

// Mock the env module to avoid validation at import time
vi.mock('@/lib/env', () => ({
  env: {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/eccb_test',
    REDIS_URL: 'redis://localhost:6379/15',
    AUTH_SECRET: 'test-secret-key-for-testing-min-32-chars',
    BETTER_AUTH_SECRET: 'test-secret-key-for-testing-min-32-chars',
    BETTER_AUTH_URL: 'http://localhost:3000',
    AUTH_URL: 'http://localhost:3000',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NEXT_PUBLIC_APP_NAME: 'ECCB Test',
    STORAGE_DRIVER: 'LOCAL',
    LOCAL_STORAGE_PATH: './storage/test',
    S3_ENDPOINT: '',
    S3_ACCESS_KEY_ID: '',
    S3_SECRET_ACCESS_KEY: '',
    S3_BUCKET_NAME: '',
    S3_REGION: 'us-east-1',
    S3_FORCE_PATH_STYLE: true,
    EMAIL_DRIVER: 'LOG',
    SMTP_FROM: 'noreply@eccb.app',
    MAX_FILE_SIZE: 52428800,
    SUPER_ADMIN_EMAIL: 'admin@eccb.org',
  },
}));

// Global test utilities
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock Next.js headers/cookies
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});

// Global error handlers
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection in test:', reason);
});
