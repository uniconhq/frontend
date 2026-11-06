/**
 * An invite link's `#` token, kept in this tab so it never travels in a URL
 * (a sign-in's `?next=` is logged). Tab storage survives the trip through Forgejo.
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
