import { describe, expect, it } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import { apiClient } from './client';
import { server } from '@/test/server';
import { serverClockOffsetMs } from '@/lib/time';

describe('the server clock', () => {
  it('is measured at the request, not when a cached answer is read', async () => {
    const behind = 60_000;
    server.use(
      http.get('/api/v1/time', async () => {
        await delay(30);
        return HttpResponse.json({ now: new Date(Date.now() + behind).toISOString() });
      }),
    );

    await apiClient.GET('/api/v1/time');
    expect(serverClockOffsetMs()).toBeGreaterThan(behind - 200);
    expect(serverClockOffsetMs()).toBeLessThan(behind + 200);

    const offsetAfterFetch = serverClockOffsetMs();
    await delay(50);
    expect(serverClockOffsetMs()).toBe(offsetAfterFetch);
  });
});
