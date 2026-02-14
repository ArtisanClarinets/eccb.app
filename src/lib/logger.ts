/**
 * Structured Logger with Request Correlation
 * 
 * Features:
 * - Structured JSON logging in production, pretty print in dev
 * - Log levels: debug, info, warn, error
 * - Request ID correlation
 * - Timestamp in ISO format
 * - Context metadata support
 * - Child logger creation
 * - Backward compatible with legacy signature
 */

const isProduction = process.env.NODE_ENV === 'production';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  userId?: string;
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  service?: string;
  env?: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  [key: string]: unknown;
}

// Color codes for pretty printing
const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: COLORS.gray,
  info: COLORS.blue,
  warn: COLORS.yellow,
  error: COLORS.red,
};

/**
 * Format log entry for production (JSON)
 */
function formatJson(entry: LogEntry): string {
  return JSON.stringify(entry);
}

/**
 * Format log entry for development (pretty print)
 */
function formatPretty(entry: LogEntry): string {
  const color = LEVEL_COLORS[entry.level];
  const levelUpper = entry.level.toUpperCase().padEnd(5);
  const timestamp = COLORS.dim + entry.timestamp + COLORS.reset;
  
  let output = `${timestamp} ${color}${levelUpper}${COLORS.reset} ${entry.message}`;
  
  if (entry.context && Object.keys(entry.context).length > 0) {
    const contextStr = Object.entries(entry.context)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${COLORS.cyan}${k}${COLORS.reset}=${JSON.stringify(v)}`)
      .join(' ');
    if (contextStr) {
      output += ` ${COLORS.dim}[${contextStr}]${COLORS.reset}`;
    }
  }
  
  if (entry.error) {
    output += `\n  ${COLORS.red}Error: ${entry.error.message}${COLORS.reset}`;
    if (entry.error.stack) {
      const stackLines = entry.error.stack.split('\n').slice(1, 5);
      output += `\n  ${COLORS.gray}${stackLines.join('\n  ')}${COLORS.reset}`;
    }
  }
  
  return output;
}

/**
 * Format a log entry based on environment
 */
function formatEntry(entry: LogEntry): string {
  return isProduction ? formatJson(entry) : formatPretty(entry);
}

/**
 * Get current ISO timestamp
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Create a base log entry
 */
function createBaseEntry(level: LogLevel, message: string, context?: LogContext): LogEntry {
  return {
    level,
    message,
    timestamp: getTimestamp(),
    service: 'eccb-app',
    env: process.env.NODE_ENV || 'development',
    context,
  };
}

/**
 * Logger interface - supports both new and legacy signatures
 */
export interface Logger {
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  // New signature: error(message, error?, context?)
  // Legacy signature: error(message, context) where context may contain 'error' key
  error(message: string, error?: Error | LogContext, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
  child(context: LogContext): Logger;
  withRequestId(requestId: string): Logger;
  withUserId(userId: string): Logger;
}

/**
 * Create a logger instance with optional base context
 */
function createLogger(baseContext: LogContext = {}): Logger {
  const log = (
    level: LogLevel,
    message: string,
    error?: Error,
    additionalContext?: LogContext
  ): void => {
    // Merge base context with additional context
    const mergedContext: LogContext = { ...baseContext, ...additionalContext };
    
    // Filter out undefined values
    const cleanContext = Object.fromEntries(
      Object.entries(mergedContext).filter(([, v]) => v !== undefined)
    ) as LogContext;
    
    const entry = createBaseEntry(level, message, Object.keys(cleanContext).length > 0 ? cleanContext : undefined);
    
    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: isProduction ? undefined : error.stack,
      };
    }
    
    const output = formatEntry(entry);
    
    // Use appropriate console method
    switch (level) {
      case 'debug':
        // Only log debug in development
        if (!isProduction) {
          console.debug(output);
        }
        break;
      case 'info':
        console.info(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'error':
        console.error(output);
        break;
    }
  };
  
  return {
    info: (message: string, context?: LogContext) => log('info', message, undefined, context),
    warn: (message: string, context?: LogContext) => log('warn', message, undefined, context),
    
    // Backward compatible error method
    // Supports both:
    // - logger.error(message, Error, context) - new signature
    // - logger.error(message, { error: ..., ...otherContext }) - legacy signature
    error: (message: string, errorOrContext?: Error | LogContext, context?: LogContext) => {
      // Check if second argument is an Error instance
      if (errorOrContext instanceof Error) {
        log('error', message, errorOrContext, context);
      } else if (errorOrContext && typeof errorOrContext === 'object' && !context) {
        // Legacy signature: second argument is context (may contain 'error' key)
        // Extract error from context if present
        const { error: errorValue, ...restContext } = errorOrContext as LogContext & { error?: unknown };
        
        if (errorValue instanceof Error) {
          log('error', message, errorValue, restContext);
        } else if (errorValue && typeof errorValue === 'string') {
          // Handle case where error is a string message
          const syntheticError = new Error(errorValue);
          log('error', message, syntheticError, restContext);
        } else {
          // No error object, just log with context
          log('error', message, undefined, errorOrContext);
        }
      } else {
        // No second argument or it's undefined
        log('error', message, undefined, context);
      }
    },
    
    debug: (message: string, context?: LogContext) => log('debug', message, undefined, context),
    
    child: (context: LogContext): Logger => {
      return createLogger({ ...baseContext, ...context });
    },
    
    withRequestId: (requestId: string): Logger => {
      return createLogger({ ...baseContext, requestId });
    },
    
    withUserId: (userId: string): Logger => {
      return createLogger({ ...baseContext, userId });
    },
  };
}

// Export default logger instance
export const logger = createLogger();

// Export factory for creating loggers with context
export const createLoggerWithContext = (context: LogContext): Logger => createLogger(context);

// Export for type checking
export default logger;
