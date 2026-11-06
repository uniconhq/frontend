/** Kept apart so a test can see where the app went without jsdom following it. */
export function leaveFor(url: string): void {
  window.location.assign(url);
}
