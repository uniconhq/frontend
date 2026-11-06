import type { Middleware } from 'openapi-fetch';
import { recordServerTime } from '@/lib/time';

// Timed at the request, not at render: a cached `now` would count its time in the cache.
const TIME_PATH = '/api/v1/time';

const startedAt = new WeakMap<Request, number>();

function isServerTime(request: Request): boolean {
  return new URL(request.url).pathname === TIME_PATH;
}

export const serverClockMiddleware: Middleware = {
  onRequest({ request }) {
    if (isServerTime(request)) startedAt.set(request, Date.now());
    return request;
  },

  async onResponse({ request, response }) {
    const requestStartedAt = startedAt.get(request);
    if (requestStartedAt === undefined || !response.ok) return response;

    const body: unknown = await response.clone().json();
    const now = (body as { now?: unknown }).now;
    if (typeof now === 'string') recordServerTime(now, requestStartedAt);
    return response;
  },
};
