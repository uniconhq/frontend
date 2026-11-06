import createFetchClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema';
import { apiErrorFromResponse, apiErrorFromTransportFailure } from './problem';
import { serverClockMiddleware } from './server-clock';

// Same origin as the API. The full origin, not '', because Node's fetch refuses relative URLs.
const baseUrl = typeof window === 'undefined' ? '' : window.location.origin;

// Every failure becomes an ApiError, even a proxy's HTML page.
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
