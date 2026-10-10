import type { AppEnvironment } from './environment.model';

/**
 * Production environment.
 *
 * `environment.development.ts` is swapped in by the `development` build
 * configuration (see `fileReplacements` in angular.json), so `ng build` compiles
 * production values into the bundle while `ng serve` talks to the local API.
 */
export const environment: AppEnvironment = {
  production: true,
  appName: 'MPloyChek',
  appVersion: '1.0.0',
  apiBaseUrl: 'https://api.mploychek.example.com/api',
  apiTimeoutMs: 30_000,
  apiDelayMs: 0,
};
