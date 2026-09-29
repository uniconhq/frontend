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

/** Only for tests: the offset otherwise lives as long as the page. */
export function resetServerClock(): void {
  offsetMs = 0;
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

/**
 * A stretch of time as a countdown shows it: days when there are any, then
 * hours, minutes and seconds, two digits each after the first, such as
 * `1d 02h 05m 09s` or `4m 30s`. Nothing left reads as `0s`.
 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const two = (value: number) => String(value).padStart(2, '0');
  if (days > 0) return `${days}d ${two(hours)}h ${two(minutes)}m ${two(seconds)}s`;
  if (hours > 0) return `${hours}h ${two(minutes)}m ${two(seconds)}s`;
  if (minutes > 0) return `${minutes}m ${two(seconds)}s`;
  return `${seconds}s`;
}
