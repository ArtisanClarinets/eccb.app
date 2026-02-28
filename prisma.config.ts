import { defineConfig } from '@prisma/config';

// Load environment variables
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch (_e) {
    // Ignore if .env file is missing or error
  }
  try {
    // @ts-expect-error - loadEnvFile signature varies by Node.js version
    process.loadEnvFile('.env', '.env.local');
  } catch (_e) {
    // Ignore if .env.local file is missing or error
  }
}

export default defineConfig({
  migrations: {
    seed: 'tsx ./prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL?.replace(/^mariadb:\/\//, 'mysql://'),
  },
});
