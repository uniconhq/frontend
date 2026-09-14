/**
 * A session can end while a page is open: it expires, someone revokes it, or
 * refreshing the Forgejo token fails. The page and its drafts stay mounted and
 * one modal says so. `armed` is what stops the modal appearing at boot, when a
 * signed-out visitor's first GET /me answers 401.
 */
let armed = false;
let open = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isSessionExpired(): boolean {
  return open;
}

/** Called by the session provider: true once a person is known to be signed in. */
export function armSessionExpiry(signedIn: boolean): void {
  armed = signedIn;
  if (!signedIn && open) {
    open = false;
    emit();
  }
}

/** Called for every 401 the app sees. Opens the modal at most once. */
export function reportUnauthenticated(): void {
  if (!armed || open) return;
  open = true;
  emit();
}

/** Only for tests: no button dismisses this modal. */
export function resetSessionExpiry(): void {
  armed = false;
  open = false;
  emit();
}
