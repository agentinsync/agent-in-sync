import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createAuthCallbackServer } from './auth.js';

function listen(server: ReturnType<typeof createAuthCallbackServer>): Promise<number> {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as AddressInfo).port);
    });
    server.on('error', reject);
  });
}

describe('createAuthCallbackServer', () => {
  it('resolves with credentials on a valid GET callback', async () => {
    const resultPromise = new Promise<unknown>((resolve, reject) => {
      const server = createAuthCallbackServer({
        state: 'test-state',
        onSuccess: result => {
          server.close();
          resolve(result);
        },
        onError: err => {
          server.close();
          reject(err);
        },
      });

      listen(server).then(async port => {
        const params = new URLSearchParams({
          state: 'test-state',
          apiKey: 'ask_test_key',
          organizationId: '00000000-0000-0000-0000-000000000001',
          organizationName: 'Test Org',
          email: 'dev@example.com',
        });
        const res = await fetch(`http://127.0.0.1:${port}/callback?${params.toString()}`);
        assert.equal(res.status, 200);
        assert.match(res.headers.get('content-type') ?? '', /text\/html/);
      });
    });

    const result = await resultPromise;
    assert.deepEqual(result, {
      apiKey: 'ask_test_key',
      organizationId: '00000000-0000-0000-0000-000000000001',
      organizationName: 'Test Org',
      email: 'dev@example.com',
    });
  });

  it('calls onError for wrong state and returns 400', async () => {
    let errorCalled = false;
    const server = createAuthCallbackServer({
      state: 'correct-state',
      onSuccess: () => {},
      onError: () => {
        errorCalled = true;
      },
    });

    const port = await listen(server);

    const params = new URLSearchParams({
      state: 'wrong-state',
      apiKey: 'ask_key',
      organizationId: '00000000-0000-0000-0000-000000000001',
      organizationName: 'Org',
      email: 'x@example.com',
    });
    const res = await fetch(`http://127.0.0.1:${port}/callback?${params.toString()}`);
    server.close();

    assert.equal(res.status, 400);
    assert.equal(errorCalled, true);
  });

  it('calls onError for missing credentials and returns 400', async () => {
    let errorCalled = false;
    const server = createAuthCallbackServer({
      state: 'test-state',
      onSuccess: () => {},
      onError: () => {
        errorCalled = true;
      },
    });

    const port = await listen(server);

    const res = await fetch(`http://127.0.0.1:${port}/callback?state=test-state&apiKey=ask_key`);
    server.close();

    assert.equal(res.status, 400);
    assert.equal(errorCalled, true);
  });

  it('returns 404 for unknown paths', async () => {
    const server = createAuthCallbackServer({
      state: 'test-state',
      onSuccess: () => {},
      onError: () => {},
    });

    const port = await listen(server);
    const res = await fetch(`http://127.0.0.1:${port}/unknown`);
    server.close();

    assert.equal(res.status, 404);
  });
});
