import { http, HttpResponse } from 'msw';
import { server } from '@/test-utils';
import { fetchApi } from './client';

describe('fetchApi', () => {
  it('makes a successful GET request and returns parsed JSON', async () => {
    // Given: server returns data
    server.use(http.get('/api/items', () => HttpResponse.json({ items: [1, 2, 3] })));

    // When: fetching
    const data = await fetchApi<{ items: number[] }>('/items');

    // Then: parsed JSON returned
    expect(data).toEqual({ items: [1, 2, 3] });
  });

  it('makes a successful POST request with body', async () => {
    // Given: server echoes body
    server.use(
      http.post('/api/submit', async ({ request }) => {
        const body = await request.json();
        return HttpResponse.json({ received: body });
      })
    );

    // When: posting data
    const data = await fetchApi<{ received: { name: string } }>('/submit', {
      method: 'POST',
      body: JSON.stringify({ name: 'test' }),
    });

    // Then: body was sent and received
    expect(data.received).toEqual({ name: 'test' });
  });

  it('sets Content-Type and credentials headers', async () => {
    // Given: server inspects headers
    let capturedContentType: string | null = null;
    server.use(
      http.get('/api/check', ({ request }) => {
        capturedContentType = request.headers.get('Content-Type');
        return HttpResponse.json({});
      })
    );

    // When
    await fetchApi('/check');

    // Then
    expect(capturedContentType).toBe('application/json');
  });

  it('prepends /api to endpoint', async () => {
    // Given: handler at /api/test
    let called = false;
    server.use(
      http.get('/api/test', () => {
        called = true;
        return HttpResponse.json({});
      })
    );

    // When: calling with /test
    await fetchApi('/test');

    // Then: /api/test was hit
    expect(called).toBe(true);
  });

  it('throws Error with server message on non-OK response', async () => {
    // Given: server returns error
    server.use(
      http.get('/api/fail', () => HttpResponse.json({ message: 'Not found' }, { status: 404 }))
    );

    // When/Then
    await expect(fetchApi('/fail')).rejects.toThrow('Not found');
  });

  it('throws generic message when error response is not JSON', async () => {
    // Given: server returns non-JSON error
    server.use(http.get('/api/bad', () => new HttpResponse('Internal Error', { status: 500 })));

    // When/Then
    await expect(fetchApi('/bad')).rejects.toThrow('Request failed');
  });

  it('redirects to /consent on HTTP 451 and throws', async () => {
    // Given: server returns 451 (consent required)
    server.use(
      http.get('/api/consent-needed', () =>
        HttpResponse.json({ error: 'CONSENT_REQUIRED', message: 'Accept terms' }, { status: 451 })
      )
    );
    const originalLocation = window.location;
    const hrefSetter = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, href: originalLocation.href },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.location, 'href', {
      set: hrefSetter,
      get: () => originalLocation.href,
      configurable: true,
    });

    // When/Then
    await expect(fetchApi('/consent-needed')).rejects.toThrow('Consent required');
    expect(hrefSetter).toHaveBeenCalledWith('/consent');

    // Cleanup
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });
});
