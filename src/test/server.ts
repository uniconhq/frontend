import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { components } from '@/api/schema';

/**
 * A fake backend for the tests, so they exercise the real client, the real
 * error parsing and the real query cache. Mocking our own fetch wrapper would
 * only prove that the mock was called.
 */
type Me = components['schemas']['Me'];
type SessionInfo = components['schemas']['SessionInfo'];

export const someone: Me = {
  user_id: 7,
  username: 'kenny',
  name: 'Kenny Lewi',
  avatar_url: 'http://localhost:3300/avatars/7',
  email: 'kenny@example.org',
  roles: [
    { scope: { kind: 'org', org: 'acme', contest: null, task: null }, role: 'admin' },
    {
      scope: { kind: 'contest', org: 'acme', contest: 'spring', task: null },
      role: 'manager',
    },
  ],
  degraded: false,
};

export const sessions: SessionInfo[] = [
  {
    id: '0f3a9c2e6b1d4e7f8a9b0c1d2e3f4a5b',
    created_at: '2026-09-12T08:00:00Z',
    last_seen_at: '2026-09-12T09:30:00Z',
    user_agent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0 Safari/537.36',
    current: true,
  },
  {
    id: '7d2c1b0a9f8e4d3c2b1a0f9e8d7c6b5a',
    created_at: '2026-09-11T12:00:00Z',
    last_seen_at: '2026-09-11T13:00:00Z',
    user_agent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/144.0',
    current: false,
  },
];

/** An RFC 9457 body, the way the backend sends one. */
export function problem(
  status: number,
  code: string,
  extra: Record<string, unknown> = {},
) {
  return HttpResponse.json(
    {
      type: 'about:blank',
      title: code.replaceAll('_', ' '),
      status,
      detail: `${code} detail`,
      code,
      ...extra,
    },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

const signedOut = http.get('/api/v1/me', () => problem(401, 'unauthenticated'));
export const signedIn = http.get('/api/v1/me', () => HttpResponse.json(someone));
const noRegistration = http.get('/api/v1/auth/register-url', () =>
  HttpResponse.json({ url: null }),
);
export const sessionList = http.get('/api/v1/me/sessions', () =>
  HttpResponse.json(sessions),
);

const serverTime = http.get('/api/v1/time', () =>
  HttpResponse.json({ now: '2026-09-12T10:00:00Z' }),
);

/**
 * The default world every test starts in: nobody signed in, a backend that
 * answers. `server.resetHandlers()` returns to exactly this after each test.
 */
export const server = setupServer(signedOut, noRegistration, serverTime);
