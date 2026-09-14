import createFetchClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema';
import { apiErrorFromResponse, apiErrorFromTransportFailure } from './problem';
import { serverClockMiddleware } from './server-clock';

/**
 * The app is served from the same origin as the API, so every call is relative
 * and the session cookie rides along without CORS. Paths are passed exactly as
 * the OpenAPI document names them, so the base carries no prefix. It is the
 * current origin rather than an empty string because Node's fetch, which the
 * tests run on, refuses a relative URL.
 */
const baseUrl = typeof window === 'undefined' ? '' : window.location.origin;

/**
 * Non-ok responses become ApiError, so React Query's `error` is always one
 * type, whether the body was a problem document or an HTML page from a proxy.
 */
const problemMiddleware: Middleware = {
  async onResponse({ response }) {
    if (response.ok) return response;
    throw await apiErrorFromResponse(response);
  },
  onError({ error }) {
    return apiErrorFromTransportFailure(error);
  },
};

export const apiClient = createFetchClient<paths>({
  baseUrl,
  credentials: 'same-origin',
  fetch: (request) => globalThis.fetch(request),
});

apiClient.use(serverClockMiddleware);
apiClient.use(problemMiddleware);
