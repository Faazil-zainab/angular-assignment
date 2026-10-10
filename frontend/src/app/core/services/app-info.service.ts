import { Injectable, inject } from '@angular/core';

import { environment } from '../../../environments/environment';
import { API_BASE_URL } from '../tokens/api.tokens';

/**
 * The only place (besides `app.config.ts`) that reads the environment files.
 *
 * Components inject this service instead of importing `environment`, so build
 * configurations stay swappable and the values are trivially mockable in tests.
 */
@Injectable({ providedIn: 'root' })
export class AppInfoService {
  private readonly baseUrl = inject(API_BASE_URL);

  readonly appName: string = environment.appName;
  readonly appVersion: string = environment.appVersion;
  readonly isProduction: boolean = environment.production;
  readonly defaultApiDelayMs: number = environment.apiDelayMs;

  /** Base URL of the API the SPA is currently talking to. */
  get apiBaseUrl(): string {
    return this.baseUrl;
  }
}
