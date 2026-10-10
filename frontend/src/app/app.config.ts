import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  type ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';

import { environment } from '../environments/environment';
import { APP_ROUTES } from './app.routes';
import { apiDelayInterceptor } from './core/interceptors/api-delay.interceptor';
import { apiTimeoutInterceptor } from './core/interceptors/api-timeout.interceptor';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { httpErrorInterceptor } from './core/interceptors/http-error.interceptor';
import { API_BASE_URL, API_DELAY_MS, API_TIMEOUT_MS } from './core/tokens/api.tokens';

/**
 * Single composition root of the SPA.
 *
 * Environment values are injected through tokens rather than imported by
 * services, so the API URL, timeout and artificial delay can be replaced in
 * tests or per build configuration without touching application code.
 *
 * Interceptor order matters: interceptors run in array order, outermost first.
 * `authInterceptor` is outermost so it can react to the *normalised* error the
 * inner `httpErrorInterceptor` produces; the delay is applied before the timeout
 * clock starts.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideAnimationsAsync(),

    provideRouter(
      APP_ROUTES,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),

    provideHttpClient(
      withFetch(),
      withInterceptors([
        authInterceptor,
        httpErrorInterceptor,
        apiDelayInterceptor,
        apiTimeoutInterceptor,
      ]),
    ),

    { provide: API_BASE_URL, useValue: environment.apiBaseUrl },
    { provide: API_DELAY_MS, useValue: environment.apiDelayMs },
    { provide: API_TIMEOUT_MS, useValue: environment.apiTimeoutMs },
  ],
};
