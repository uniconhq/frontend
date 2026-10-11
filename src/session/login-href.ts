const DEFAULT_NEXT = '/';
/** The longest path kept, as the forge's `next_path.py` keeps. */
const MAX_LENGTH = 2048;

/**
 * Where a login is allowed to land. `?next=` comes from the browser, so
 * anything that could leave this site falls back to the front page:
 * `//evil.com` is a URL, not a path. Mirrors the forge's next_path.py, and if
 * the two disagree one of them is a hole.
 */
export function safeNext(candidate: string | null | undefined): string {
  if (!candidate || !candidate.startsWith('/') || candidate.length > MAX_LENGTH)
    return DEFAULT_NEXT;
  if (candidate.startsWith('//') || candidate.startsWith('/\\')) return DEFAULT_NEXT;
  // A browser drops a tab or a line break from a URL, so `/<tab>/x` would
  // land on `//x`.
  if (/[\t\n\r]/.test(candidate)) return DEFAULT_NEXT;
  return candidate;
}

/**
 * The only place the login URL is written down. Signing in is a full-page
 * navigation to the backend; a fetch would follow the redirect in JavaScript
 * and land nowhere useful.
 *
 * @param next where to come back to, a path within this app
 */
export function loginHref(next: string): string {
  return `/api/v1/auth/login?next=${encodeURIComponent(safeNext(next))}`;
}

/**
 * The current address, for coming back to exactly where a person was. Except on
 * /login, which already says where they were going: without this, the sign-in
 * link there builds next=/login?next=/account and signing in lands on the login
 * page again.
 */
export function currentPath(location: {
  pathname: string;
  search: string;
  hash: string;
}): string {
  if (location.pathname === '/login') {
    return safeNext(new URLSearchParams(location.search).get('next'));
  }
  return `${location.pathname}${location.search}${location.hash}`;
}
