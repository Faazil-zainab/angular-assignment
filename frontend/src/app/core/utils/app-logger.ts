import { environment } from '../../../environments/environment';

export type AppLogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Small console logger shared by the SPA.
 *
 * In production only warnings and errors are emitted, so debug output used while
 * wiring features can stay in the code without leaking into the shipped bundle.
 */
class AppLogger {
  private readonly enabled: boolean;

  constructor(private readonly scope: string) {
    this.enabled = !environment.production;
  }

  /** Derives a logger that prefixes its scope, e.g. `mploychek:http`. */
  child(scope: string): AppLogger {
    return new AppLogger(`${this.scope}:${scope}`);
  }

  debug(message: string, ...rest: unknown[]): void {
    if (this.enabled) {
      console.debug(`[${this.scope}] ${message}`, ...rest);
    }
  }

  info(message: string, ...rest: unknown[]): void {
    if (this.enabled) {
      console.info(`[${this.scope}] ${message}`, ...rest);
    }
  }

  warn(message: string, ...rest: unknown[]): void {
    console.warn(`[${this.scope}] ${message}`, ...rest);
  }

  error(message: string, ...rest: unknown[]): void {
    console.error(`[${this.scope}] ${message}`, ...rest);
  }
}

export const appLogger = new AppLogger(environment.appName.toLowerCase());
