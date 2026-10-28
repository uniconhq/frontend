import type {
  FeedEntry,
  Grading,
  GradingStatus,
  RegradeChangeKind,
  RunsResult,
  Submitter,
} from '@/api/types';

/**
 * A grading that went wrong on Unicon's side (`system_error`), not through
 * anything the submission did: one name for it on every page.
 */
export const FAILED_WORDS = 'Failed on Unicon’s side';

/**
 * Each status as the feed and its filter name it. A queued grading is not
 * yet sent to a machine; a dispatched one is sent and waits for a machine
 * to take it.
 */
export const STATUS: Record<GradingStatus, string> = {
  queued: 'Not sent to a machine yet',
  dispatched: 'Sent, waiting for a machine',
  running: 'Running',
  done: 'Done',
  cancelled: 'Cancelled',
  system_error: FAILED_WORDS,
  over_limit: 'Over the limit',
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

/** Each kind of change a regrade made, as the feed reads it by regrade. */
const CHANGES: readonly RegradeChangeKind[] = [
  'regraded',
  'new',
  'running',
  'failed',
  'over_limit',
];

function isChange(value: string): value is RegradeChangeKind {
  return (CHANGES as readonly string[]).includes(value);
}

/**
 * The filters, each a search parameter of the page, so a link keeps them.
 * `latest` keeps each submission's latest attempt alone, as the contest
 * page's count of failed gradings counts them; null for every attempt.
 * `regrade` lists one regrade's submissions instead, each once with what it
 * changed, narrowed to one kind by `change` (#448); task, status and latest
 * do not apply with it.
 */
export type Filters = {
  task: string | null;
  entrant: string | null;
  user: string | null;
  status: GradingStatus | null;
  latest: true | null;
  regrade: string | null;
  change: RegradeChangeKind | null;
};

export type FilterKey = keyof Filters;

export function readFilters(search: URLSearchParams): Filters {
  const read = (key: string) => {
    const value = search.get(key)?.trim() ?? '';
    return value === '' ? null : value;
  };
  const status = read('status');
  const change = read('change');
  return {
    task: read('task'),
    entrant: read('entrant'),
    user: read('user'),
    status: status !== null && isStatus(status) ? status : null,
    latest: read('latest') === 'true' ? true : null,
    regrade: read('regrade'),
    change: change !== null && isChange(change) ? change : null,
  };
}

/** The gradings that failed and wait for a retry or for staff, as the queue's `failed` counts them. */
export const FAILED_SEARCH = 'status=system_error&latest=true';

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

/**
 * The filters as the feed's query, leaving out the ones not set, and those
 * a regrade's listing does not read.
 */
export function feedQuery({
  task,
  entrant,
  user,
  status,
  latest,
  regrade,
  change,
}: Filters) {
  const who = {
    ...(entrant !== null && { entrant }),
    ...(user !== null && { user }),
  };
  if (regrade !== null) {
    return { regrade, ...(change !== null && { change }), ...who };
  }
  return {
    ...(task !== null && { task }),
    ...who,
    ...(status !== null && { status }),
    ...(latest !== null && { latest }),
  };
}

/**
 * Whose a submission is: its entrant by name, with the member who made it
 * where that is someone else's name, as in a team: "Red (carol)".
 */
export function submitterOf(by: Submitter): string {
  const entrant = by.entrant_name ?? 'An entrant';
  return by.username === null || by.username === by.entrant_name
    ? entrant
    : `${entrant} (${by.username})`;
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
 * gives them, which is newest first. A submission is its task, its entrant
 * and its number, since each entrant numbers its own; the time it was made
 * plays no part.
 */
export function bySubmission(
  entries: FeedEntry[],
): { key: string; attempts: FeedEntry[] }[] {
  const groups = new Map<string, FeedEntry[]>();
  for (const entry of entries) {
    const key = `${entry.task ?? ''}\n${entry.by.entrant}\n${String(entry.grading.submission_number)}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups].map(([key, attempts]) => ({
    key,
    attempts: [...attempts].sort((a, b) => b.grading.attempt - a.grading.attempt),
  }));
}

/**
 * A submission's attempts by pipeline, the early ones first, each line's
 * highest attempt first. A submission whose runs are not all shown during
 * the contest is graded twice, early and late, each pipeline with attempts
 * of its own, so neither replaces the other.
 */
export function byPipeline(
  attempts: FeedEntry[],
): { pipeline: Grading['pipeline']; attempts: FeedEntry[] }[] {
  return (['early', 'late'] as const)
    .map((pipeline) => ({
      pipeline,
      attempts: attempts.filter((entry) => entry.grading.pipeline === pipeline),
    }))
    .filter((line) => line.attempts.length > 0);
}

/**
 * What a finished grading's result comes to: the first step done once that
 * did not pass, such as a compile, or the first run that did not, or
 * accepted when every one did.
 */
export function resultOf(result: RunsResult): string {
  const stopped = Object.values(result.once.outcomes).find(
    (outcome) => outcome !== 'accepted',
  );
  if (stopped !== undefined) return stopped;
  const failed = result.runs.find((run) => run.verdict !== 'accepted');
  return failed === undefined ? 'accepted' : failed.verdict;
}
