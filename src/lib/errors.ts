/**
 * Custom error classes for standardized error handling
 * Prevents information leakage while maintaining internal debugging capability
 */

import { env } from '../config/index.js';

/**
 * Base application error
 * All custom errors extend this for consistent handling
 */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR',
    public isOperational: boolean = true,
    public details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to safe JSON for client response
   * Hides internal details in production
   */
  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        // Only include details in development
        ...(env.isDevelopment && this.details ? { details: this.details } : {}),
      },
    };
  }
}

/**
 * 400 Bad Request - Client sent invalid data
 */
export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request', details?: unknown) {
    super(message, 400, 'BAD_REQUEST', true, details);
  }
}

/**
 * 401 Unauthorized - Authentication required or failed
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required', code: string = 'UNAUTHORIZED') {
    super(message, 401, code, true);
  }
}

/**
 * 403 Forbidden - Authenticated but lacks permission
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Permission denied', requiredPermission?: string) {
    super(
      message,
      403,
      'FORBIDDEN',
      true,
      requiredPermission ? { requiredPermission } : undefined
    );
  }
}

/**
 * 404 Not Found - Resource does not exist
 */
export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND', true);
  }
}

/**
 * 409 Conflict - Request conflicts with current state
 */
export class ConflictError extends AppError {
  constructor(message: string = 'Conflict', details?: unknown) {
    super(message, 409, 'CONFLICT', true, details);
  }
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export class RateLimitError extends AppError {
  constructor(
    public retryAfter: number, // seconds
    message: string = 'Too many requests'
  ) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', true, { retryAfter });
  }
}

/**
 * 500 Internal Server Error - Unexpected server error
 */
export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error', originalError?: Error) {
    super(
      // Never leak internal error details to client in production
      env.isProduction ? 'Internal server error' : message,
      500,
      'INTERNAL_ERROR',
      false,
      env.isDevelopment && originalError ? { originalError: originalError.message } : undefined
    );
  }
}

/**
 * 503 Service Unavailable - Temporary service disruption
 */
export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable', service?: string) {
    super(message, 503, 'SERVICE_UNAVAILABLE', true, service ? { service } : undefined);
  }
}

/**
 * Validation error with field-level details
 */
export class ValidationError extends BadRequestError {
  constructor(message: string = 'Validation failed', public errors: unknown) {
    super(message, { errors });
    this.code = 'VALIDATION_ERROR';
  }
}

/**
 * Token-specific errors for JWT handling
 */
export class TokenExpiredError extends UnauthorizedError {
  constructor() {
    super('Token has expired', 'TOKEN_EXPIRED');
  }
}

export class TokenInvalidError extends UnauthorizedError {
  constructor(reason?: string) {
    super(reason || 'Invalid token', 'TOKEN_INVALID');
  }
}

export class TokenRevokedError extends UnauthorizedError {
  constructor() {
    super('Token has been revoked', 'TOKEN_REVOKED');
  }
}

/**
 * Account security errors
 */
export class AccountLockedError extends UnauthorizedError {
  constructor(public retryAfter: number) {
    super('Account temporarily locked due to too many failed attempts', 'ACCOUNT_LOCKED');
  }
}

export class InvalidCredentialsError extends UnauthorizedError {
  constructor() {
    // Generic message to prevent username enumeration
    super('Invalid credentials', 'INVALID_CREDENTIALS');
  }
}

/**
 * SSRF protection error
 */
export class SSRFError extends BadRequestError {
  constructor(message: string = 'Request to disallowed host') {
    super(message);
    this.code = 'SSRF_BLOCKED';
  }
}

/**
 * Check if error is an operational error (expected) vs programming error (bug)
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}
