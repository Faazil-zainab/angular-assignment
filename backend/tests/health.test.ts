import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../src/app';
import { config } from '../src/config/env.config';

interface HealthBody {
  success: true;
  data: {
    status: string;
    service: string;
    version: string;
    environment: string;
    uptimeSeconds: number;
    apiDelayMs: number;
    storageDriver: string;
  };
  meta: { requestId: string; timestamp: string; durationMs?: number; delayMs?: number };
}

interface ErrorBody {
  success: false;
  error: { code: string; message: string };
  meta: { requestId: string };
}

/**
 * Starts the real Express app on an ephemeral port, so the tests exercise the
 * same middleware stack production uses (CORS, delay, logging, error handling).
 */
describe('MPloyChek API (phase 1 scaffolding)', () => {
  let server: Server;
  let baseUrl = '';

  before(async () => {
    server = createApp().listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', () => resolve());
      server.once('error', (error: Error) => reject(error));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('GET /api/health answers with the success envelope', async () => {
    const response = await fetch(`${baseUrl}${config.apiPrefix}/health`);

    assert.equal(response.status, 200);
    assert.ok(response.headers.get('x-request-id'), 'X-Request-Id header should be echoed back');

    const body = (await response.json()) as HealthBody;
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'ok');
    assert.equal(body.data.service, config.appName);
    assert.equal(body.data.version, config.appVersion);
    assert.equal(body.data.environment, config.nodeEnv);
    assert.equal(body.data.storageDriver, config.storage.driver);
    assert.ok(body.data.uptimeSeconds >= 0);
    assert.ok(body.meta.requestId.length > 0);
  });

  it('allows requests from an origin listed in CORS_ORIGINS', async () => {
    const origin = config.corsOrigins[0];
    assert.ok(origin, 'CORS_ORIGINS must contain at least one entry');

    const response = await fetch(`${baseUrl}${config.apiPrefix}/health`, {
      headers: { Origin: origin },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
  });

  it('rejects unknown routes with the error envelope', async () => {
    const response = await fetch(`${baseUrl}${config.apiPrefix}/does-not-exist`);

    assert.equal(response.status, 404);
    const body = (await response.json()) as ErrorBody;
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'ROUTE_NOT_FOUND');
    assert.match(body.error.message, /No route matches GET/i);
  });

  it('honours the configurable API delay parameter', async () => {
    const target = 250;
    const startedAt = Date.now();
    const response = await fetch(`${baseUrl}${config.apiPrefix}/health?delay=${target}`);
    const elapsed = Date.now() - startedAt;

    assert.equal(response.status, 200);
    const body = (await response.json()) as HealthBody;
    assert.equal(body.meta.delayMs, target);
    assert.ok(elapsed >= target - 20, `expected >= ~${target}ms, measured ${elapsed}ms`);
  });
});
