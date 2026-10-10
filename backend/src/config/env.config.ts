import path from 'node:path';

import dotenv from 'dotenv';

/**
 * Loads `backend/.env` (if present) into `process.env` before anything else in
 * the process reads configuration. Real environment variables always win over
 * the file, so the same build runs unchanged in dev, CI and production - which
 * is also how `--env-file=.env.test` isolates the test suite.
 */
dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

export type NodeEnv = 'development' | 'test' | 'production';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';
export type StorageDriver = 'json-file';

/** Everything the application is allowed to know about its environment. */
export interface AppConfig {
  readonly appName: string;
  readonly appVersion: string;
  readonly nodeEnv: NodeEnv;
  readonly isDevelopment: boolean;
  readonly isTest: boolean;
  readonly isProduction: boolean;

  readonly host: string;
  readonly port: number;
  readonly apiPrefix: string;
  readonly corsOrigins: readonly string[];
  readonly jsonBodyLimit: string;

  readonly logLevel: LogLevel;
  readonly logColors: boolean;

  readonly apiDelayMs: number;
  readonly apiDelayMaxMs: number;

  readonly storage: {
    readonly driver: StorageDriver;
    /** Absolute path of the directory holding the JSON documents. */
    readonly directory: string;
    /** Absolute path of `users.json`. */
    readonly usersFile: string;
    /** Absolute path of `records.json`. */
    readonly recordsFile: string;
  };

  readonly auth: {
    /** HMAC key used to sign and verify access tokens. */
    readonly jwtSecret: string;
    readonly jwtExpiresInSeconds: number;
    readonly jwtIssuer: string;
    readonly jwtAudience: string;
    /** Creates the development data when the store is empty. */
    readonly seedUsers: boolean;
  };
}

const ENV_HINT = 'Check backend/.env (see backend/.env.example for every supported key).';

/** Placeholder used when JWT_SECRET is not configured outside production. */
const DEVELOPMENT_JWT_SECRET = 'mploychek-development-only-secret-not-for-production';

/** Values that must never sign a production token, even if long enough. */
const REJECTED_PRODUCTION_SECRETS = new Set([DEVELOPMENT_JWT_SECRET, 'change-this-secret']);

/** Raised for invalid or missing configuration so the process fails fast. */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(`${message} ${ENV_HINT}`);
    this.name = 'ConfigurationError';
  }
}

function readRaw(key: string): string | undefined {
  const value = process.env[key];
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function readString(key: string, fallback: string): string {
  return readRaw(key) ?? fallback;
}

function readNumber(
  key: string,
  fallback: number,
  bounds: { min?: number; max?: number } = {},
): number {
  const raw = readRaw(key);
  if (raw === undefined) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new ConfigurationError(`Environment variable ${key} must be a number, received "${raw}".`);
  }
  if (bounds.min !== undefined && parsed < bounds.min) {
    throw new ConfigurationError(`Environment variable ${key} must be >= ${bounds.min}.`);
  }
  if (bounds.max !== undefined && parsed > bounds.max) {
    throw new ConfigurationError(`Environment variable ${key} must be <= ${bounds.max}.`);
  }
  return parsed;
}

function readBoolean(key: string, fallback: boolean): boolean {
  const raw = readRaw(key)?.toLowerCase();
  if (raw === undefined) {
    return fallback;
  }
  if (['true', '1', 'yes', 'on'].includes(raw)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(raw)) {
    return false;
  }
  throw new ConfigurationError(`Environment variable ${key} must be a boolean, received "${raw}".`);
}

function readEnum<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const raw = readRaw(key);
  if (raw === undefined) {
    return fallback;
  }
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new ConfigurationError(
      `Environment variable ${key} must be one of [${allowed.join(', ')}], received "${raw}".`,
    );
  }
  return raw as T;
}

function readList(key: string, fallback: readonly string[]): string[] {
  const raw = readRaw(key);
  if (raw === undefined) {
    return [...fallback];
  }
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeNodeEnv(): NodeEnv {
  const raw = readRaw('NODE_ENV')?.toLowerCase();
  if (raw === 'dev') {
    return 'development';
  }
  if (raw === 'prod') {
    return 'production';
  }
  return readEnum<NodeEnv>('NODE_ENV', ['development', 'test', 'production'], 'development');
}

/** Shortest HMAC key we accept in production (HS256 needs >= 256 bits of entropy). */
const MINIMUM_PRODUCTION_SECRET_LENGTH = 32;

function readJwtSecret(isProduction: boolean): string {
  const secret = readRaw('JWT_SECRET');

  if (!isProduction) {
    return secret ?? DEVELOPMENT_JWT_SECRET;
  }

  if (secret === undefined) {
    throw new ConfigurationError('JWT_SECRET must be set when NODE_ENV=production.');
  }
  if (REJECTED_PRODUCTION_SECRETS.has(secret)) {
    throw new ConfigurationError(
      'JWT_SECRET is still a placeholder value. Generate a unique secret for this deployment.',
    );
  }
  if (secret.length < MINIMUM_PRODUCTION_SECRET_LENGTH) {
    throw new ConfigurationError(
      `JWT_SECRET must be at least ${MINIMUM_PRODUCTION_SECRET_LENGTH} characters in production.`,
    );
  }
  return secret;
}

function buildConfig(): AppConfig {
  const nodeEnv = normalizeNodeEnv();
  const isProduction = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';

  const logLevel = readEnum<LogLevel>(
    'LOG_LEVEL',
    ['debug', 'info', 'warn', 'error', 'silent'],
    isTest ? 'error' : 'info',
  );

  // Read early so a bad value throws while we still know why.
  const apiDelayMaxMs = readNumber('API_DELAY_MAX_MS', 10_000, { min: 0, max: 600_000 });
  const apiDelayMs = readNumber('API_DELAY_MS', 0, { min: 0, max: apiDelayMaxMs });

  // The local JSON store: one directory holding one document per collection.
  const storageDirectory = readString('STORAGE_DIR', 'data');
  const resolveStorage = (fileName: string): string =>
    path.resolve(process.cwd(), storageDirectory, fileName);

  return Object.freeze({
    appName: readString('APP_NAME', 'MPloyChek API'),
    appVersion: readString('APP_VERSION', '1.0.0'),
    nodeEnv,
    isDevelopment: nodeEnv === 'development',
    isTest,
    isProduction,

    host: readString('HOST', '0.0.0.0'),
    port: readNumber('PORT', 3000, { min: 1, max: 65_535 }),
    apiPrefix: readString('API_PREFIX', '/api'),
    corsOrigins: readList('CORS_ORIGINS', ['http://localhost:4200', 'http://127.0.0.1:4200']),
    jsonBodyLimit: readString('JSON_BODY_LIMIT', '1mb'),

    logLevel,
    logColors: !isProduction && logLevel !== 'silent' && Boolean(process.stdout.isTTY),

    apiDelayMs,
    apiDelayMaxMs,

    storage: Object.freeze({
      driver: readEnum<StorageDriver>('STORAGE_DRIVER', ['json-file'], 'json-file'),
      directory: path.resolve(process.cwd(), storageDirectory),
      usersFile: resolveStorage(readString('STORAGE_USERS_FILE', 'users.json')),
      recordsFile: resolveStorage(readString('STORAGE_RECORDS_FILE', 'records.json')),
    }),

    auth: Object.freeze({
      jwtSecret: readJwtSecret(isProduction),
      jwtExpiresInSeconds: readNumber('JWT_EXPIRES_IN_SECONDS', 3600, { min: 60, max: 604_800 }),
      jwtIssuer: readString('JWT_ISSUER', 'mploychek-api'),
      jwtAudience: readString('JWT_AUDIENCE', 'mploychek-spa'),
      seedUsers: readBoolean('SEED_USERS', !isProduction),
    }),
  });
}

/** Immutable, validated configuration for the current process. */
export const config: AppConfig = buildConfig();
