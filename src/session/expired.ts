import { useSyncExternalStore } from 'react';

// `armed` stops the modal at boot, when a signed-out visitor's GET /me answers 401.
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

export function useSessionExpired(): boolean {
  return useSyncExternalStore(subscribe, isSessionExpired, () => false);
}

export function armSessionExpiry(signedIn: boolean): void {
  armed = signedIn;
  if (!signedIn && open) {
    open = false;
    emit();
  }
}

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
