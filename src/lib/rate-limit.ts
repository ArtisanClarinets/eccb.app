import { redis } from './redis';
import { headers } from 'next/headers';

interface RateLimitOptions {
  limit: number;
  window: number; // in seconds
}

export async function rateLimit(
  key: string,
  options: RateLimitOptions = { limit: 100, window: 60 }
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  const now = Math.floor(Date.now() / 1000);
  const reset = now + options.window;
  const redisKey = `rate-limit:${key}`;

  try {
    const current = await redis.get(redisKey);
    const count = current ? parseInt(current) : 0;

    if (count >= options.limit) {
      return {
        success: false,
        limit: options.limit,
        remaining: 0,
        reset,
      };
    }

    const multi = redis.multi();
    multi.incr(redisKey);
    if (!current) {
      multi.expire(redisKey, options.window);
    }
    await multi.exec();

    return {
      success: true,
      limit: options.limit,
      remaining: options.limit - (count + 1),
      reset,
    };
  } catch (error) {
    console.error('Rate limit error:', error);
    // Fallback to allow if Redis is down
    return {
      success: true,
      limit: options.limit,
      remaining: 1,
      reset,
    };
  }
}

export async function getIP(): Promise<string> {
  const headersList = await headers();
  const forwardedFor = headersList.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  return '127.0.0.1';
}
