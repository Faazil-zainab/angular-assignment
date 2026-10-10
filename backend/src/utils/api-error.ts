/**
 * Error taxonomy for the API.
 *
 * Only `ApiError` instances are treated as *operational*: they carry a safe
 * HTTP status code, a stable machine readable `code` and a message that may be
 * exposed to the client. Anything else is an unexpected programmer error and is
 * reported as a generic 500 by the error middleware.
 */
export interface ApiErrorOptions {
  /** Stable, SCREAMING_SNAKE machine readable identifier, e.g. `USER_NOT_FOUND`. */
  code?: string;
  /** Extra context that is safe to return to the client (never secrets). */
  details?: unknown;
  /** Original error that caused this one, kept for logging. */
  cause?: unknown;
}

export interface SerializedApiError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  /** Marks the error as expected/handled, as opposed to a bug. */
  readonly isOperational = true;

  constructor(statusCode: number, message: string, options: ApiErrorOptions = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = options.code ?? defaultCodeFor(statusCode);
    this.details = options.details;

    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }

    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = 'The request payload is invalid.', options?: ApiErrorOptions): ApiError {
    return new ApiError(400, message, options);
  }

  static unauthorized(message = 'Authentication is required.', options?: ApiErrorOptions): ApiError {
    return new ApiError(401, message, options);
  }

  static forbidden(message = 'You do not have access to this resource.', options?: ApiErrorOptions): ApiError {
    return new ApiError(403, message, options);
  }

  static notFound(message = 'The requested resource was not found.', options?: ApiErrorOptions): ApiError {
    return new ApiError(404, message, options);
  }

  static conflict(message = 'The resource already exists.', options?: ApiErrorOptions): ApiError {
    return new ApiError(409, message, options);
  }

  static tooManyRequests(message = 'Too many requests, please retry later.', options?: ApiErrorOptions): ApiError {
    return new ApiError(429, message, options);
  }

  static internal(message = 'An unexpected error occurred.', options?: ApiErrorOptions): ApiError {
    return new ApiError(500, message, options);
  }

  static unavailable(message = 'The service is temporarily unavailable.', options?: ApiErrorOptions): ApiError {
    return new ApiError(503, message, options);
  }

  static isApiError(value: unknown): value is ApiError {
    return value instanceof ApiError;
  }

  toJSON(): SerializedApiError {
    const serialized: SerializedApiError = {
      statusCode: this.statusCode,
      code: this.code,
      message: this.message,
    };
    if (this.details !== undefined) {
      serialized.details = this.details;
    }
    return serialized;
  }
}

const DEFAULT_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

function defaultCodeFor(statusCode: number): string {
  return DEFAULT_CODES[statusCode] ?? 'ERROR';
}
