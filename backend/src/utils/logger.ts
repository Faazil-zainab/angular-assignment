import { config, type LogLevel } from '../config/env.config';

export type { LogLevel };

/** Arbitrary structured fields attached to a log line. */
export type LogMeta = Record<string, unknown>;

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

const ANSI_COLOURS: Record<Exclude<LogLevel, 'silent'>, string> = {
  debug: '\u001b[90m',
  info: '\u001b[36m',
  warn: '\u001b[33m',
  error: '\u001b[31m',
};

const ANSI_RESET = '\u001b[0m';

/** Turns `unknown` throwables into something JSON friendly. */
export function errorMeta(error: unknown): LogMeta {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message, stack: error.stack };
  }
  return { errorMessage: String(error) };
}

/**
 * Minimal dependency free logger.
 *
 * - Human readable single lines in development (with optional ANSI colour).
 * - One JSON object per line in production, ready for a log collector.
 */
export class Logger {
  private readonly threshold: number;

  constructor(
    private readonly scope: string,
    private readonly level: LogLevel = config.logLevel,
  ) {
    this.threshold = LEVEL_WEIGHT[level];
  }

  /** Derives a logger that prefixes its scope, e.g. `mploychek:http`. */
  child(scope: string): Logger {
    return new Logger(`${this.scope}:${scope}`, this.level);
  }

  debug(message: string, meta?: LogMeta): void {
    this.write('debug', message, meta);
  }

  info(message: string, meta?: LogMeta): void {
    this.write('info', message, meta);
  }

  warn(message: string, meta?: LogMeta): void {
    this.write('warn', message, meta);
  }

  error(message: string, meta?: LogMeta): void {
    this.write('error', message, meta);
  }

  private write(level: Exclude<LogLevel, 'silent'>, message: string, meta?: LogMeta): void {
    if (LEVEL_WEIGHT[level] < this.threshold) {
      return;
    }

    const timestamp = new Date().toISOString();
    const hasMeta = meta !== undefined && Object.keys(meta).length > 0;

    if (config.isProduction) {
      const payload = { timestamp, level, scope: this.scope, message, ...(hasMeta ? meta : {}) };
      this.emit(level, `${JSON.stringify(payload)}\n`);
      return;
    }

    const label = level.toUpperCase().padEnd(5);
    const tag = config.logColors ? `${ANSI_COLOURS[level]}${label}${ANSI_RESET}` : label;
    const suffix = hasMeta ? ` ${JSON.stringify(meta)}` : '';
    this.emit(level, `${timestamp} ${tag} [${this.scope}] ${message}${suffix}\n`);
  }

  private emit(level: Exclude<LogLevel, 'silent'>, line: string): void {
    const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
    stream.write(line);
  }
}

/** Root logger - use `logger.child('scope')` inside a module. */
export const logger = new Logger('mploychek');
