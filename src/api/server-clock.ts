import type { Middleware } from 'openapi-fetch';
import { recordServerTime } from '@/lib/time';

/**
 * The clock offset is measured where the request happens, not where its answer
 * is rendered: a component reading a cached `now` would measure however long
 * that answer sat in the query cache. Only GET /api/v1/time is timed.
 */
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
