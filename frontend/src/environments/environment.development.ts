import type { AppEnvironment } from './environment.model';

/**
 * Development environment - used by `ng serve` and
 * `ng build --configuration development`.
 *
 * Points at the local Express API (`backend/.env` -> PORT=3000) whose CORS
 * allow list already contains http://localhost:4200.
 */
export const environment: AppEnvironment = {
  production: false,
  appName: 'MPloyChek',
  appVersion: '1.0.0',
  apiBaseUrl: 'http://localhost:3000/api',
  apiTimeoutMs: 15_000,
  apiDelayMs: 0,
};
