import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VirusScanner } from '../virus-scanner';
import { env } from '@/lib/env';

// Mock the logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock env
vi.mock('@/lib/env', () => ({
  env: {
    ENABLE_VIRUS_SCAN: false,
    CLAMAV_HOST: 'localhost',
    CLAMAV_PORT: 3310,
  },
}));

describe('VirusScanner', () => {
  let scanner: VirusScanner;

  beforeEach(() => {
    scanner = new VirusScanner();
    vi.clearAllMocks();
  });

  it('should return clean when scanning is disabled', async () => {
    env.ENABLE_VIRUS_SCAN = false;
    const result = await scanner.scan(Buffer.from('test'));
    expect(result.clean).toBe(true);
  });

  it('should log warning and return clean when scanning is enabled but implementation missing', async () => {
    env.ENABLE_VIRUS_SCAN = true;
    
    const result = await scanner.scan(Buffer.from('test'));
    
    expect(result.clean).toBe(true);
    expect(result.message).toContain('implementation missing');
    
    // Verify logger was called
    const { logger } = await import('@/lib/logger');
    expect(logger.info).toHaveBeenCalledWith(
      'Virus scanning enabled but not implemented', 
      expect.objectContaining({
        clamavHost: 'localhost',
        clamavPort: 3310
      })
    );
  });

  it('should return clean false when implementation throws an error', async () => {
    env.ENABLE_VIRUS_SCAN = true;
    const { logger } = await import('@/lib/logger');

    // Force an error in the try block
    vi.mocked(logger.info).mockImplementationOnce(() => {
      throw new Error('Unexpected error during scan');
    });

    const result = await scanner.scan(Buffer.from('test'));

    expect(result.clean).toBe(false);
    expect(result.message).toBe('Virus scan failed');
    expect(logger.error).toHaveBeenCalledWith(
      'Virus scan failed',
      expect.objectContaining({
        error: expect.any(Error)
      })
    );
  });

  it('should handle empty buffer correctly', async () => {
    env.ENABLE_VIRUS_SCAN = true;
    const result = await scanner.scan(Buffer.from(''));
    expect(result.clean).toBe(true);
    expect(result.message).toContain('implementation missing');
  });

  it('should handle large buffer correctly', async () => {
    env.ENABLE_VIRUS_SCAN = true;
    const largeBuffer = Buffer.alloc(1024 * 1024, 'a');
    const result = await scanner.scan(largeBuffer);
    expect(result.clean).toBe(true);
    expect(result.message).toContain('implementation missing');
  });
});
