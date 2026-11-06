const DEFAULT_NEXT = '/';
const MAX_LENGTH = 2048;

/** Keep in step with the forge's next_path.py; if they differ, one is a hole. */
export function safeNext(candidate: string | null | undefined): string {
  if (!candidate || !candidate.startsWith('/') || candidate.length > MAX_LENGTH)
    return DEFAULT_NEXT;
  if (candidate.startsWith('//') || candidate.startsWith('/\\')) return DEFAULT_NEXT;
  // Browsers drop tabs and line breaks, so `/<tab>/x` would land on `//x`.
  if (/[\t\n\r]/.test(candidate)) return DEFAULT_NEXT;
  return candidate;
}

/** A full-page navigation: a fetch would follow the redirect and land nowhere. */
export function loginHref(next: string): string {
  return `/api/v1/auth/login?next=${encodeURIComponent(safeNext(next))}`;
}

/** On /login, its own `next`, or signing in would land on /login again. */
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
