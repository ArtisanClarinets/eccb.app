import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, createLoggerWithContext } from '../logger';

describe('Logger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Spy on console.info for info logs
    consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should log info messages', () => {
    logger.info('test message', { foo: 'bar' });

    expect(consoleSpy).toHaveBeenCalled();
    const callArgs = consoleSpy.mock.calls[0][0];
    
    // In development mode, output is pretty-printed
    expect(callArgs).toContain('test message');
    expect(callArgs).toContain('INFO');
  });

  it('should include timestamp in logs', () => {
    logger.info('test message');

    const callArgs = consoleSpy.mock.calls[0][0];
    // Timestamp should be ISO format (YYYY-MM-DDTHH:MM:SS)
    expect(callArgs).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('should create child logger with context', () => {
    const childLogger = logger.child({ requestId: 'req_123' });
    
    childLogger.info('child message');

    expect(consoleSpy).toHaveBeenCalled();
    const callArgs = consoleSpy.mock.calls[0][0];
    expect(callArgs).toContain('child message');
  });

  it('should create logger with request ID', () => {
    const requestLogger = logger.withRequestId('req_456');
    
    requestLogger.info('request message');

    expect(consoleSpy).toHaveBeenCalled();
    const callArgs = consoleSpy.mock.calls[0][0];
    expect(callArgs).toContain('request message');
  });

  it('should create logger with user ID', () => {
    const userLogger = logger.withUserId('user_789');
    
    userLogger.info('user message');

    expect(consoleSpy).toHaveBeenCalled();
    const callArgs = consoleSpy.mock.calls[0][0];
    expect(callArgs).toContain('user message');
  });

  it('should log warnings', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    logger.warn('warning message', { reason: 'test' });

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('should log errors with Error object', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const testError = new Error('Test error');
    
    logger.error('error occurred', testError, { context: 'test' });

    expect(errorSpy).toHaveBeenCalled();
    const callArgs = errorSpy.mock.calls[0][0];
    expect(callArgs).toContain('error occurred');
    expect(callArgs).toContain('Test error');
    errorSpy.mockRestore();
  });

  it('should create logger with context using factory', () => {
    const contextLogger = createLoggerWithContext({ service: 'test-service' });
    
    contextLogger.info('service message');

    expect(consoleSpy).toHaveBeenCalled();
  });
});
