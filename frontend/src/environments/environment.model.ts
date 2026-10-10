/**
 * Shape of every frontend environment file.
 *
 * It lives in its own module on purpose: the build swaps `environment.ts` for
 * `environment.development.ts` via `fileReplacements`, so the concrete files must
 * not import anything from each other - after the swap `./environment` *is* the
 * development file, and a self-referencing import would fail to compile.
 */
export interface AppEnvironment {
  readonly production: boolean;
  readonly appName: string;
  readonly appVersion: string;
  /** Base URL of the MPloyChek API, including the `/api` prefix. */
  readonly apiBaseUrl: string;
  /** Abort an HTTP request after this many milliseconds. */
  readonly apiTimeoutMs: number;
  /**
   * Default artificial latency asked from the API (`?delay=<ms>`).
   *
   * Mirrors the backend `API_DELAY_MS` parameter and is used to demonstrate
   * asynchronous API processing in the UI. `0` disables it.
   */
  readonly apiDelayMs: number;
}
