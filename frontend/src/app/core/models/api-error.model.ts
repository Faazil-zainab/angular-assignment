/** Normalised transport error produced by `httpErrorInterceptor`. */
export interface NormalizedApiErrorShape {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

/**
 * A single error type every feature can rely on, regardless of whether the
 * failure was a network problem, a timeout, an HTTP error status or the API's
 * own `{ success: false }` envelope.
 */
export class ApiHttpError extends Error implements NormalizedApiErrorShape {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(shape: NormalizedApiErrorShape) {
    super(shape.message);
    this.name = 'ApiHttpError';
    this.status = shape.status;
    this.code = shape.code;
    this.details = shape.details;
  }

  /** True when the request never reached the server. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }
}
