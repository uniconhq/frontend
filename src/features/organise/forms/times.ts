/**
 * Files hold ISO 8601 times with an offset; the form shows the organiser's
 * local time. An untouched time is not written back, so it keeps its form.
 */

const two = (value: number) => String(value).padStart(2, '0');

function hasOffset(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(
    text.trim(),
  );
}

/** Empty for no time, or for text that is not a time with an offset. */
export function localOf(value: unknown): string {
  if (typeof value !== 'string' || !hasOffset(value)) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
  const time = `${two(date.getHours())}:${two(date.getMinutes())}`;
  const seconds = date.getSeconds();
  return `${day}T${time}${seconds === 0 ? '' : `:${two(seconds)}`}`;
}

export function instantOf(value: unknown): number | null {
  return localOf(value) === '' ? null : new Date(value as string).getTime();
}

export function unreadableTime(value: unknown): boolean {
  return value !== undefined && value !== null && localOf(value) === '';
}

/** Uses the offset at that moment, so summer time is right. */
export function isoOf(local: string): string | undefined {
  if (local.trim() === '') return undefined;
  const date = new Date(local);
  if (Number.isNaN(date.getTime())) return undefined;
  const day = `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
  const time = `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
  const minutesEast = -date.getTimezoneOffset();
  const sign = minutesEast >= 0 ? '+' : '-';
  const offset = Math.abs(minutesEast);
  return `${day}T${time}${sign}${two(Math.floor(offset / 60))}:${two(offset % 60)}`;
}

export function zoneName(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
