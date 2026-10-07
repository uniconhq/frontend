/**
 * Times sit in the files as ISO 8601 with an offset (`2026-06-01T09:00:00Z`)
 * and are shown in the form in the organiser's own time, as the browser's
 * date and time field takes them (`2026-06-01T17:00`). A time the organiser
 * set is written back with their offset (`2026-06-01T17:00:00+08:00`), which
 * names the same moment; a time they did not touch is not written at all, so
 * it keeps the form it had.
 */

const two = (value: number) => String(value).padStart(2, '0');

/** Whether the text is a time the file may hold: a date, a time and an offset. */
function hasOffset(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(
    text.trim(),
  );
}

/**
 * The file's time as the date and time field's value, in local time, with
 * seconds only when there are any. Empty for no time, or for text that is not
 * a time with an offset, which the form shows beside the field.
 */
export function localOf(value: unknown): string {
  if (typeof value !== 'string' || !hasOffset(value)) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
  const time = `${two(date.getHours())}:${two(date.getMinutes())}`;
  const seconds = date.getSeconds();
  return `${day}T${time}${seconds === 0 ? '' : `:${two(seconds)}`}`;
}

/** The moment a time in the file names, or null for anything that is not one. */
export function instantOf(value: unknown): number | null {
  return localOf(value) === '' ? null : new Date(value as string).getTime();
}

/** Whether a value read from the file is a time the field could not show. */
export function unreadableTime(value: unknown): boolean {
  return value !== undefined && value !== null && localOf(value) === '';
}

/**
 * The field's local date and time as the file holds a time: with seconds and
 * the organiser's own offset at that moment, so summer time is right.
 */
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

/** The organiser's own zone, said under each time field. */
export function zoneName(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
