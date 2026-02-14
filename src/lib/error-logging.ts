/**
 * Error Logging Utilities
 * 
 * Features:
 * - Consistent error response format
 * - Include request ID in error response
 * - Don't leak stack traces in production
 * - Log all errors before returning
 */

import { NextResponse } from 'next/server';
import { logger, type LogContext } from '@/lib/logger';
import { ZodError } from 'zod';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Standard error codes for API responses
 */
export enum ErrorCode {
  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_FIELD = 'MISSING_FIELD',
  
  // Authentication errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  
  // Resource errors
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  
  // Server errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  
  // Business logic errors
  OPERATION_FAILED = 'OPERATION_FAILED',
  INVALID_STATE = 'INVALID_STATE',
}

/**
 * API Error class with code and context
 */
export class ApiError extends Error {
  code: ErrorCode;
  statusCode: number;
  context?: LogContext;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.INTERNAL_ERROR,
    statusCode: number = 500,
    context?: LogContext
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.context = context;
  }

  /**
   * Create a 400 Bad Request error
   */
  static badRequest(message: string, context?: LogContext): ApiError {
    return new ApiError(message, ErrorCode.INVALID_INPUT, 400, context);
  }

  /**
   * Create a 401 Unauthorized error
   */
  static unauthorized(message: string = 'Unauthorized', context?: LogContext): ApiError {
    return new ApiError(message, ErrorCode.UNAUTHORIZED, 401, context);
  }

  /**
   * Create a 403 Forbidden error
   */
  static forbidden(message: string = 'Forbidden', context?: LogContext): ApiError {
    return new ApiError(message, ErrorCode.FORBIDDEN, 403, context);
  }

  /**
   * Create a 404 Not Found error
   */
  static notFound(message: string = 'Resource not found', context?: LogContext): ApiError {
    return new ApiError(message, ErrorCode.NOT_FOUND, 404, context);
  }

  /**
   * Create a 409 Conflict error
   */
  static conflict(message: string, context?: LogContext): ApiError {
    return new ApiError(message, ErrorCode.ALREADY_EXISTS, 409, context);
  }

  /**
   * Create a 422 Validation error
   */
  static validation(message: string, context?: LogContext): ApiError {
    return new ApiError(message, ErrorCode.VALIDATION_ERROR, 422, context);
  }

  /**
   * Create a 429 Rate Limited error
   */
  static rateLimited(context?: LogContext): ApiError {
    return new ApiError('Too many requests', ErrorCode.RATE_LIMITED, 429, context);
  }

  /**
   * Create a 500 Internal Server error
   */
  static internal(message: string = 'Internal server error', context?: LogContext): ApiError {
    return new ApiError(message, ErrorCode.INTERNAL_ERROR, 500, context);
  }
}

/**
 * Standard API error response format
 */
export interface ApiErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    requestId?: string;
    details?: unknown;
    stack?: string;
  };
}

/**
 * Log an error with context
 */
export function logError(
  error: Error | ApiError,
  context?: LogContext,
  requestId?: string
): void {
  const errorContext: LogContext = {
    ...context,
    ...(error instanceof ApiError ? { code: error.code, statusCode: error.statusCode } : {}),
    ...(requestId ? { requestId } : {}),
  };

  if (error instanceof ApiError) {
    logger.error(`API Error: ${error.message}`, error, errorContext);
  } else {
    logger.error(`Error: ${error.message}`, error, errorContext);
  }
}

/**
 * Create a standardized error response
 */
export function errorResponse(
  error: Error | ApiError | ZodError,
  requestId?: string
): NextResponse<ApiErrorResponse> {
  // Log the error
  logError(error instanceof Error ? error : new Error(String(error)), undefined, requestId);

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const response: ApiErrorResponse = {
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        requestId,
        details: error.issues,
      },
    };
    return NextResponse.json(response, { status: 400 });
  }

  // Handle ApiError
  if (error instanceof ApiError) {
    const response: ApiErrorResponse = {
      error: {
        code: error.code,
        message: error.message,
        requestId,
        details: error.context,
        ...(isProduction ? {} : { stack: error.stack }),
      },
    };
    return NextResponse.json(response, { status: error.statusCode });
  }

  // Handle generic errors
  const response: ApiErrorResponse = {
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: isProduction ? 'Internal server error' : (error as Error).message,
      requestId,
      ...(isProduction ? {} : { stack: (error as Error).stack }),
    },
  };
  return NextResponse.json(response, { status: 500 });
}

/**
 * Wrap an API route handler with error handling
 */
export function withErrorHandling<T>(
  handler: () => Promise<NextResponse<T>>,
  requestId?: string
): Promise<NextResponse<T | ApiErrorResponse>> {
  return handler().catch((error: Error | ApiError | ZodError) => {
    return errorResponse(error, requestId);
  });
}

/**
 * Log and throw an error
 */
export function logAndThrow(error: Error | ApiError, context?: LogContext): never {
  logError(error, context);
  throw error;
}

/**
 * Create a not found error for a resource
 */
export function notFoundError(resource: string, id?: string | number): ApiError {
  return ApiError.notFound(`${resource}${id ? ` with id ${id}` : ''} not found`);
}

/**
 * Assert a condition or throw an error
 */
export function assert(
  condition: boolean,
  message: string,
  code: ErrorCode = ErrorCode.INVALID_STATE
): asserts condition {
  if (!condition) {
    throw new ApiError(message, code, 400);
  }
}

/**
 * Assert that a value is not null or undefined
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message: string = 'Value is required'
): asserts value is T {
  if (value === null || value === undefined) {
    throw new ApiError(message, ErrorCode.MISSING_FIELD, 400);
  }
}

// Export default object for convenience
export default {
  ApiError,
  ErrorCode,
  errorResponse,
  logError,
  logAndThrow,
  notFoundError,
  assert,
  assertDefined,
  withErrorHandling,
};
