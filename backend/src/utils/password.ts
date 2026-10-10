import { scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import bcrypt from 'bcryptjs';

import { logger } from './logger';

const log = logger.child('password');

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * bcrypt cost factor. 10 is the usual production default: ~50ms per hash on
 * commodity hardware, which is slow enough to frustrate offline cracking and fast
 * enough for a login endpoint.
 */
const BCRYPT_ROUNDS = 10;

const BCRYPT_PREFIX = /^\$2[aby]?\$\d{2}\$/;
const SCRYPT_PREFIX = 'scrypt$';

/** Accepted work factors when verifying a legacy scrypt digest (DoS guard). */
const SCRYPT_BOUNDS = {
  N: { min: 2 ** 12, max: 2 ** 20 },
  r: { min: 1, max: 32 },
  p: { min: 1, max: 16 },
} as const;

/**
 * Hashes a password with bcrypt (the algorithm required by the assessment).
 *
 * Plain text passwords exist only in memory: the seed definitions and the request
 * body. Everything that reaches a file is a digest.
 */
export async function hashPassword(plainTextPassword: string): Promise<string> {
  return bcrypt.hash(normalize(plainTextPassword), BCRYPT_ROUNDS);
}

/**
 * Verifies a password against a stored digest.
 *
 * Both current bcrypt digests and legacy `scrypt$...` digests are supported, so
 * upgrading the algorithm does not lock existing users out of their accounts
 * (previously seeded data keeps working, and `npm run seed` re-hashes it).
 *
 * Returns `false` - never throws - for an unrecognised or malformed digest: a
 * corrupted record must behave exactly like a wrong password so it cannot be
 * probed for.
 */
export async function verifyPassword(plainTextPassword: string, storedDigest: string): Promise<boolean> {
  if (typeof storedDigest !== 'string' || storedDigest.length === 0) {
    log.warn('rejected a password check against an empty digest');
    return false;
  }

  if (BCRYPT_PREFIX.test(storedDigest)) {
    try {
      return await bcrypt.compare(normalize(plainTextPassword), storedDigest);
    } catch {
      log.warn('rejected a password check against a malformed bcrypt digest');
      return false;
    }
  }

  if (storedDigest.startsWith(SCRYPT_PREFIX)) {
    return verifyLegacyScryptDigest(plainTextPassword, storedDigest);
  }

  log.warn('rejected a password check against an unsupported digest algorithm');
  return false;
}

/**
 * Verifies a digest produced by the previous scrypt implementation.
 *
 * Format: `scrypt$N$r$p$<salt base64>$<key base64>`. Kept only so existing data
 * keeps working; new hashes are always bcrypt.
 */
async function verifyLegacyScryptDigest(
  plainTextPassword: string,
  storedDigest: string,
): Promise<boolean> {
  const parts = storedDigest.split('$');
  if (parts.length !== 6) {
    log.warn('rejected a password check against a malformed scrypt digest');
    return false;
  }

  const [, rawN, rawR, rawP, rawSalt, rawHash] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];

  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);

  if (
    !withinBounds(N, SCRYPT_BOUNDS.N) ||
    !withinBounds(r, SCRYPT_BOUNDS.r) ||
    !withinBounds(p, SCRYPT_BOUNDS.p)
  ) {
    log.warn('rejected a password check against a scrypt digest with unsupported work factors');
    return false;
  }

  const salt = Buffer.from(rawSalt, 'base64');
  const expected = Buffer.from(rawHash, 'base64');
  if (salt.length === 0 || expected.length === 0) {
    return false;
  }

  const derived = await scryptAsync(normalize(plainTextPassword), salt, expected.length, {
    N,
    r,
    p,
    maxmem: 64 * 1024 * 1024,
  });

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function withinBounds(value: number, bounds: { min: number; max: number }): boolean {
  return Number.isInteger(value) && value >= bounds.min && value <= bounds.max;
}

function normalize(plainTextPassword: string): string {
  // NFKC keeps non-ASCII passwords stable across clients that normalise input.
  // Note: bcrypt only reads the first 72 bytes, which is enforced by the library.
  return plainTextPassword.normalize('NFKC');
}
