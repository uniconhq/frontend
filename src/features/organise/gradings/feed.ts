import type { FeedEntry, Grading, GradingStatus, Submitter } from '@/api/types';

/** Each status as the feed and its filter name it. */
export const STATUS: Record<GradingStatus, string> = {
  queued: 'Queued',
  dispatched: 'Waiting for a machine',
  running: 'Running',
  done: 'Done',
  cancelled: 'Cancelled',
  system_error: 'System error',
};

export const STATUSES = Object.keys(STATUS) as GradingStatus[];

export const UNFINISHED = new Set<GradingStatus>(['queued', 'dispatched', 'running']);

/**
 * How often gradings are read again while the live stream is down and one of
 * them is still to finish, and otherwise. The stream makes them stale on
 * every grading's change while it is open. A grading takes seconds to
 * minutes, and an organiser watching for stuck ones needs no faster.
 */
const WAITING_MS = 10_000;
const MEANWHILE_MS = 60_000;

export function readAgainIn(live: boolean, entries: FeedEntry[] | undefined): number {
  return !live && entries?.some((entry) => UNFINISHED.has(entry.grading.status))
    ? WAITING_MS
    : MEANWHILE_MS;
}

function isStatus(value: string): value is GradingStatus {
  return Object.hasOwn(STATUS, value);
}

/** The filters, each a search parameter of the page, so a link keeps them. */
export type Filters = {
  task: string | null;
  user: string | null;
  team: string | null;
  status: GradingStatus | null;
};

export type FilterKey = keyof Filters;

export function readFilters(search: URLSearchParams): Filters {
  const read = (key: string) => {
    const value = search.get(key)?.trim() ?? '';
    return value === '' ? null : value;
  };
  const status = read('status');
  return {
    task: read('task'),
    user: read('user'),
    team: read('team'),
    status: status !== null && isStatus(status) ? status : null,
  };
}

/** The filters with one changed, as a search the page navigates to. */
export function withFilter(
  search: URLSearchParams,
  key: FilterKey,
  value: string,
): URLSearchParams {
  const next = new URLSearchParams(search);
  const trimmed = value.trim();
  if (trimmed === '') next.delete(key);
  else next.set(key, trimmed);
  return next;
}

/** The filters as the feed's query, leaving out the ones not set. */
export function feedQuery({ task, user, team, status }: Filters) {
  return {
    ...(task !== null && { task }),
    ...(user !== null && { user }),
    ...(team !== null && { team }),
    ...(status !== null && { status }),
  };
}

/** Who made a submission, by username or by team name. */
export function submitterOf(by: Submitter): string {
  if (by.team !== null) return `${by.name ?? 'A deleted team'} (team)`;
  return by.name ?? 'A deleted account';
}

/** A task by its letter and name, or its name alone where it has no letter. */
export function titleOf(task: string, label: string | null): string {
  return label === null ? task : `${label} · ${task}`;
}

/** A grading's name for a screen reader, where several rows read alike. */
export function nameOf(entry: FeedEntry): string {
  const task = entry.label ?? entry.task ?? 'a task';
  const { grading } = entry;
  return `${task} submission ${String(grading.submission_number)} by ${submitterOf(entry.by)}, attempt ${String(grading.attempt)}`;
}

/**
 * A submission's attempts together, the highest first, in the order the feed
 * gives them, which is newest first. A submission is its task, who made it and
 * its number, since each contestant or team numbers their own; the time it
 * was made plays no part.
 */
export function bySubmission(
  entries: FeedEntry[],
): { key: string; attempts: FeedEntry[] }[] {
  const groups = new Map<string, FeedEntry[]>();
  for (const entry of entries) {
    const who = entry.by.team ?? `user:${String(entry.by.user_id)}`;
    const key = `${entry.task ?? ''}\n${who}\n${String(entry.grading.submission_number)}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups].map(([key, attempts]) => ({
    key,
    attempts: [...attempts].sort((a, b) => b.grading.attempt - a.grading.attempt),
  }));
}

/**
 * What a finished grading's result comes to: what stopped the run, or the
 * first test that did not pass, or accepted when every one did.
 */
export function resultOf(result: NonNullable<Grading['result']>): string {
  return (
    result.stopped ??
    result.tests.find((test) => test.outcome !== 'accepted')?.outcome ??
    'accepted'
  );
}

/**
 * Where a grading's run log is read: the API route itself, on this origin,
 * which answers plain text the browser shows as it is and runs nothing in.
 */
export function logHref(
  path: { org: string; contest: string; task: string },
  grading: string,
): string {
  const part = encodeURIComponent;
  const task = `/api/v1/orgs/${part(path.org)}/contests/${part(path.contest)}/tasks/${part(path.task)}`;
  return `${task}/gradings/${part(grading)}/log`;
}
