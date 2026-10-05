/**
 * The token an invite's mail link carries after its `#`. It is moved out of
 * the address as soon as the page sees it and kept in this tab, so it never
 * travels in a URL: not in the `?next=` of a sign-in, which the backend and
 * the proxy would log, and not in the browser's history. The tab's storage
 * outlives the full-page trip through Forgejo; where storage is refused, the
 * copy in memory still serves a person already signed in.
 */
const KEY = 'unicon.invite-token';

let held: string | null = null;

export function keepInviteToken(token: string): void {
  held = token;
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    // The copy in memory is enough unless the tab leaves for a sign-in.
  }
}

export function readInviteToken(): string | null {
  try {
    return sessionStorage.getItem(KEY) ?? held;
  } catch {
    return held;
  }
}

export function forgetInviteToken(): void {
  held = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing was kept there.
  }
}
