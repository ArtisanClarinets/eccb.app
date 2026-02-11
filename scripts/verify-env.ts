import { env } from '../src/lib/env';

console.log('✅ Environment Validation Success');
console.log('App Name:', env.NEXT_PUBLIC_APP_NAME);
console.log('Storage Driver:', env.STORAGE_DRIVER);
console.log('Database URL:', process.env.DATABASE_URL || 'Using SQLite');
