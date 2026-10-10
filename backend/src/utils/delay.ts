/**
 * The artificial-latency primitive used by the API.
 *
 * The assessment requires the API to simulate slow background-verification calls
 * so a client can demonstrate loading states, and it must do so **without
 * blocking the event loop**. Everything here is promise based - `setTimeout`
 * yields to the event loop, so other requests keep being served while one waits.
 */

/** Smallest accepted delay, in milliseconds. */
export const DELAY_MIN_MS = 0;

/** Largest accepted delay, in milliseconds. Values above this are rejected. */
export const DELAY_MAX_MS = 10_000;

/** Message returned (HTTP 400) when the delay parameter is out of range or not a number. */
export const DELAY_ERROR_MESSAGE = `Delay must be between ${DELAY_MIN_MS} and ${DELAY_MAX_MS} milliseconds`;

/**
 * Resolves after `ms` milliseconds without blocking the event loop.
 *
 * Uses `setTimeout`, which schedules the continuation on the timer phase of the
 * event loop instead of spinning the CPU - the difference between an `await
 * delay(3000)` and a `while (Date.now() - start < 3000) {}` busy loop.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Reads the raw `delay` (or `delayMs`) query value.
 *
 * Returns `undefined` when the parameter was not supplied - an empty value counts
 * as not supplied, so `?delay=` behaves like `?delay=0`. Repeated parameters
 * (`?delay=1&delay=2`) use the first value.
 */
export function readRawDelay(query: Record<string, unknown>): string | number | undefined {
  const candidate = query['delay'] ?? query['delayMs'];
  const raw = Array.isArray(candidate) ? candidate[0] : candidate;

  if (typeof raw === 'number') {
    return raw;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }
  return undefined;
}

/**
 * Parses and validates a raw delay value.
 *
 * Returns `undefined` when the value is absent (the caller then falls back to its
 * configured default) and `null` when it is present but invalid, so callers can
 * tell "not supplied" apart from "supplied but rejected" without exceptions.
 */
export function parseDelay(raw: string | number | undefined): number | undefined | null {
  if (raw === undefined) {
    return undefined;
  }

  const parsed = typeof raw === 'number' ? raw : Number(raw);

  if (!Number.isInteger(parsed) || parsed < DELAY_MIN_MS || parsed > DELAY_MAX_MS) {
    return null;
  }

  return parsed;
}
