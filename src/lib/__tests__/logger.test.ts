import { describe, it, expect, vi } from 'vitest';
import { logger } from '../logger';

describe('Logger', () => {
  it('should log info messages', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('test message', { foo: 'bar' });

    expect(consoleSpy).toHaveBeenCalled();
    const callArgs = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(callArgs);

    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('test message');
    expect(parsed.foo).toBe('bar');
    expect(parsed.timestamp).toBeDefined();

    consoleSpy.mockRestore();
  });
});
