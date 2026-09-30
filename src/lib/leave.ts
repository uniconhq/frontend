/**
 * A full-page navigation to another site, the one way the app hands the
 * browser over to Forgejo. Kept apart so a test can see where the app went
 * without jsdom trying to follow it.
 */
export function leaveFor(url: string): void {
  window.location.assign(url);
}
