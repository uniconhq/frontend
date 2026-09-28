import { describe, expect, it } from 'vitest';
import {
  ApiError,
  apiErrorFromResponse,
  apiErrorFromTransportFailure,
  toApiError,
} from './problem';

describe('apiErrorFromResponse', () => {
  it('keeps the stable code from a problem document', async () => {
    const response = new Response(
      JSON.stringify({
        type: 'about:blank',
        title: 'You are the only admin',
        status: 409,
        detail: 'Promote someone else first.',
        code: 'sole_admin',
      }),
      { status: 409, headers: { 'content-type': 'application/problem+json' } },
    );

    const error = await apiErrorFromResponse(response);

    expect(error.code).toBe('sole_admin');
    expect(error.status).toBe(409);
    expect(error.title).toBe('You are the only admin');
    expect(error.detail).toBe('Promote someone else first.');
  });

  it('turns a proxy error page into unexpected_response and shows no HTML', async () => {
    const response = new Response('<html><body>502 Bad Gateway</body></html>', {
      status: 502,
      headers: { 'content-type': 'text/html' },
    });

    const error = await apiErrorFromResponse(response);

    expect(error.code).toBe('unexpected_response');
    expect(error.status).toBe(502);
    expect(error.detail).toBeUndefined();
    expect(error.message).not.toContain('<html>');
  });

  it('treats a JSON body without a code as unexpected', async () => {
    const response = new Response(JSON.stringify({ detail: 'Not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });

    expect((await apiErrorFromResponse(response)).code).toBe('unexpected_response');
  });
});

describe('apiErrorFromTransportFailure', () => {
  it('reports an unreachable backend as network_error with no status', () => {
    const error = apiErrorFromTransportFailure(new TypeError('Failed to fetch'));

    expect(error.code).toBe('network_error');
    expect(error.status).toBe(0);
  });
});

describe('toApiError', () => {
  it('passes an ApiError through untouched', () => {
    const error = new ApiError({ code: 'sole_admin', status: 409, title: 'x' });

    expect(toApiError(error)).toBe(error);
  });

  it('wraps anything else as unexpected_error, keeping its message', () => {
    const error = toApiError(new Error('render blew up'));

    expect(error.code).toBe('unexpected_error');
    expect(error.status).toBe(0);
    expect(error.detail).toBe('render blew up');
  });
});
