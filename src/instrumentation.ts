/**
 * Next.js Instrumentation Hook
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * Runs once when the Next.js server is initialised (node runtime only).
 * Used for one-time startup tasks: seeding DB settings from env, connecting
 * background workers, etc.
 *
 * IMPORTANT: This file must live at src/instrumentation.ts (or the root).
 * Enable with `experimental.instrumentationHook = true` in next.config.ts.
 */
export async function register() {
  // Only run server-side bootstrap in the Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Dynamic import avoids bundling DB/Prisma into the Edge runtime
    const { bootstrapLLMApiKeysFromEnv } = await import('@/lib/llm/config-loader');
    const { bootstrapSmartUploadSettings } = await import('@/lib/smart-upload/bootstrap');

    // Seed LLM API keys from env vars into the DB on first startup (no-op if already set)
    await bootstrapLLMApiKeysFromEnv();

    // Ensure all Smart Upload system settings exist in DB
    await bootstrapSmartUploadSettings().catch(() => {
      // Non-fatal — DB might not be ready yet on cold start; will retry next request
    });
  }
}
