import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

import express from 'express';

import { errorHandler } from '../src/middleware/error.middleware';

interface ErrorBody {
  success: false;
  error: { code: string; message: string };
  meta: { requestId: string; timestamp: string };
}

/**
 * Tests the terminal error middleware in isolation.
 *
 * A throwaway Express app is used so the 500 path and the body-parser failures can
 * be provoked on demand; the production app deliberately has no route that throws.
 */
describe('errorHandler() middleware', () => {
  let server: Server;
  let baseUrl = '';

  before(async () => {
    const app = express();
    app.use(express.json());

    app.get('/boom', () => {
      throw new Error('kaboom');
    });

    app.get('/teapot', () => {
      throw Object.assign(new Error('short and stout'), { status: 418 });
    });

    app.post('/echo', (req, res) => {
      res.json({ ok: true, body: req.body });
    });

    app.use(errorHandler());

    server = app.listen(0, '127.0.0.1');
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

  it('turns an unexpected throw into a 500 error envelope', async () => {
    const response = await fetch(`${baseUrl}/boom`);

    assert.equal(response.status, 500);
    const raw = await response.text();
    const body = JSON.parse(raw) as ErrorBody;

    assert.equal(body.success, false);
    assert.equal(body.error.code, 'INTERNAL_ERROR');
    assert.equal(body.error.message, 'kaboom');
    assert.ok(body.meta.requestId.length > 0, 'the envelope still carries request metadata');
    assert.ok(!raw.includes('stack'), 'stack traces must never be serialized');
  });

  it('maps malformed JSON to 400 instead of 500', async () => {
    const response = await fetch(`${baseUrl}/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"unterminated": ',
    });

    assert.equal(response.status, 400);
    const body = (await response.json()) as ErrorBody;
    assert.equal(body.error.code, 'INVALID_JSON');
  });

  it('honours a framework supplied status code', async () => {
    const response = await fetch(`${baseUrl}/teapot`);

    assert.equal(response.status, 418);
    const body = (await response.json()) as ErrorBody;
    assert.equal(body.error.message, 'short and stout');
  });

  it('leaves successful responses untouched', async () => {
    const response = await fetch(`${baseUrl}/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, body: { hello: 'world' } });
  });
});
