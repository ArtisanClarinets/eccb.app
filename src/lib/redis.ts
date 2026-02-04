// Mock Redis implementation for local development if Redis is not available
import { env } from '@/lib/env';
import Redis from 'ioredis';

// Basic in-memory fallback
class InMemoryRedis {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    const value = this.store.get(key);
    return value || null;
  }

  async set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, value);
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    this.store.set(key, value);
    // Basic expire simulation
    setTimeout(() => {
      this.store.delete(key);
    }, seconds * 1000);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    const deleted = this.store.delete(key);
    return deleted ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    const val = parseInt(this.store.get(key) || '0', 10);
    const newVal = val + 1;
    this.store.set(key, newVal.toString());
    return newVal;
  }

  async expire(key: string, seconds: number): Promise<number> {
    setTimeout(() => {
      this.store.delete(key);
    }, seconds * 1000);
    return 1;
  }
}

// Use real Redis if configured and not just localhost default without verification
// For this sandbox, we'll try to connect, but catch errors and fallback
let redisClient: Redis | InMemoryRedis;

try {
  // If we are in a test/sandbox env without redis, this might fail or hang.
  // We can default to InMemory for safety in development unless explicitly production
  if (env.NODE_ENV === 'production') {
     redisClient = new Redis(env.REDIS_URL);
  } else {
    // In dev, try to connect but fallback quickly?
    // Actually, let's just use InMemory for the sandbox to avoid timeouts.
    console.warn('Using InMemory Redis for development/sandbox');
    redisClient = new InMemoryRedis();
  }
} catch (error) {
  console.warn('Failed to initialize Redis, using in-memory fallback:', error);
  redisClient = new InMemoryRedis();
}

export const redis = redisClient;
