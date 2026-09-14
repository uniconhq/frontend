/**
 * Server time is the only time. Contestant laptops are wrong by minutes often
 * enough that a countdown driven by Date.now() would tell some people they
 * still have three minutes after the contest closed. The offset is measured
 * once from GET /time and kept here.
 */

let offsetMs = 0;

/**
 * @param serverIso the `now` field of GET /time
 * @param requestStartedAt Date.now() taken immediately before the request
 *
 * Half the round trip is charged to each direction, which is wrong by at most a
 * few tens of milliseconds on a bad link.
 */
export function recordServerTime(
  serverIso: string,
  requestStartedAt: number,
  receivedAt: number = Date.now(),
): void {
  const serverAtReceipt = Date.parse(serverIso) + (receivedAt - requestStartedAt) / 2;
  offsetMs = serverAtReceipt - receivedAt;
}

export function serverClockOffsetMs(): number {
  return offsetMs;
}

export function serverNow(): Date {
  return new Date(Date.now() + offsetMs);
}

/** Wall clock in the viewer's own timezone, seconds included. */
export function formatTimeOfDay(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

/** Date and time in the viewer's own timezone. */
export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
