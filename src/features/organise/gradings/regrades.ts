import { $api } from '@/api/query';
import type {
  FeedEntry,
  RegradeChangeKind,
  RegradeSide,
  RegradeSummary,
} from '@/api/types';
import { useFallbackPoll } from '@/live';
import { verdictLabel } from '@/ui/verdicts';
import { formatExact } from '@/lib/exact';
import { formatDateTime } from '@/lib/time';

/** Each task's latest regrade of many, newest first. */
export const REGRADES = '/api/v1/orgs/{org}/contests/{contest}/gradings/regrades';

/** Each task's latest regrade, read again now and then while the live stream is down. */
export function useRegrades(path: { org: string; contest: string }) {
  return $api.useQuery(
    'get',
    REGRADES,
    { params: { path } },
    { refetchInterval: useFallbackPoll(30_000) },
  );
}

/** Gradings filtered to one regrade's submissions, to one kind of change when given. */
export function regradeSearch(regrade: string, change: string | null): string {
  const search = new URLSearchParams({ regrade });
  if (change !== null) search.set('change', change);
  return search.toString();
}

/**
 * One count of a regrade's summary as it reads: its words, and the kind of
 * change its link filters Gradings to, null for every submission it graded.
 */
export type SummaryPart = {
  key: string;
  words: string;
  change: RegradeChangeKind | null;
};

/** A count with its verb agreeing: "1 now fails to compile", "2 now fail to compile". */
function counted(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/**
 * What stopped a run before its tests, in an organiser's words, as one
 * submission and as several: a compile error is the run failing to compile;
 * any other, what it stopped on.
 */
const STOPPED: Partial<Record<string, [one: string, many: string]>> = {
  compile_error: ['now fails to compile', 'now fail to compile'],
  time_limit: [
    'now runs out of time before its tests',
    'now run out of time before their tests',
  ],
  memory_limit: [
    'now runs out of memory before its tests',
    'now run out of memory before their tests',
  ],
  output_limit: [
    'now writes too much before its tests',
    'now write too much before their tests',
  ],
  runtime_error: ['now crashes before its tests', 'now crash before their tests'],
};

const STOPPED_ANYHOW: [string, string] = [
  'now stops before its tests',
  'now stop before their tests',
];

/**
 * How many of the submissions a regrade now stops before their tests
 * stopped on what, from those the feed listed of them (`stops`, each
 * submission's new result's stop); the rest, or all while they are not
 * read yet, said as stopping before their tests.
 */
function stoppedParts(count: number, stops: (string | null)[] | null): SummaryPart[] {
  const known = (stops ?? []).slice(0, count);
  const tally = new Map<string, number>();
  for (const stop of known) {
    const words = stop === null ? undefined : STOPPED[stop];
    const key = words === undefined ? '' : (stop ?? '');
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  const rest = count - known.length;
  if (rest > 0) tally.set('', (tally.get('') ?? 0) + rest);
  return [...tally].map(([stop, many]) => {
    const [one, several] = STOPPED[stop] ?? STOPPED_ANYHOW;
    return {
      key: `stopped-${stop}`,
      words: counted(many, one, several),
      change: 'stopped' as const,
    };
  });
}

/**
 * A regrade's summary as its counts, in the order an organiser reads them
 * (#448): how many it graded, then what got worse, what failed or was not
 * graded, and what got better or was graded for the first time; a count of
 * 0 is left out, and so are the unchanged, which "graded" holds. "120
 * graded · 4 went down · 2 now fail to compile · 1 went up". Those still
 * being graded are said apart, by `runningWords`.
 */
export function summaryParts(
  summary: RegradeSummary,
  stops: (string | null)[] | null = null,
): SummaryPart[] {
  const { counts } = summary;
  const parts: SummaryPart[] = [
    { key: 'graded', words: `${String(summary.graded)} graded`, change: null },
  ];
  if (counts.down > 0) {
    parts.push({
      key: 'down',
      words: `${String(counts.down)} went down`,
      change: 'down',
    });
  }
  if (counts.stopped > 0) parts.push(...stoppedParts(counts.stopped, stops));
  if (counts.failed > 0) {
    parts.push({
      key: 'failed',
      words: `${String(counts.failed)} failed on Unicon’s side`,
      change: 'failed',
    });
  }
  if (counts.over_limit > 0) {
    parts.push({
      key: 'over_limit',
      words: `${String(counts.over_limit)} not graded, over the limit`,
      change: 'over_limit',
    });
  }
  if (counts.up > 0) {
    parts.push({ key: 'up', words: `${String(counts.up)} went up`, change: 'up' });
  }
  if (counts.new > 0) {
    parts.push({
      key: 'new',
      words: `${String(counts.new)} graded for the first time`,
      change: 'new',
    });
  }
  return parts;
}

/** A regrade's task by its letter, or its name where it has none. */
export function regradedTask(summary: RegradeSummary): string {
  return summary.label ?? summary.task ?? 'a task the contest no longer lists';
}

/** A regrade by its task: "Regrade of A". */
export function regradeOf(summary: RegradeSummary): string {
  return `Regrade of ${regradedTask(summary)}`;
}

/** What started a regrade, by whom and when, in a line. */
export function causeWords(summary: RegradeSummary): string {
  const at = formatDateTime(new Date(summary.started_at));
  if (summary.cause === 'save') {
    return `After a save that changed how the task grades, ${at}, against publication ${String(summary.publication)}.`;
  }
  const by = summary.started_by_name === null ? '' : ` by ${summary.started_by_name}`;
  return `After a rejudge${by}, ${at}, against publication ${String(summary.publication)}.`;
}

/** How many a regrade still grades, while it runs; null once none is. */
export function runningWords(summary: RegradeSummary): string | null {
  if (!summary.running) return null;
  const left = summary.counts.running;
  return left > 0
    ? `Still running: ${counted(left, 'submission is', 'submissions are')} being graded.`
    : 'Still running.';
}

/** What each kind of change is called where Gradings lists those submissions. */
export const CHANGE_WORDS: Record<RegradeChangeKind, string> = {
  up: 'Went up',
  down: 'Went down',
  stopped: 'Now stops before its tests',
  unchanged: 'Unchanged',
  new: 'Graded for the first time',
  running: 'Still being graded',
  failed: 'Failed on Unicon’s side',
  over_limit: 'Not graded, over the limit',
};

/**
 * One result a regrade compares, in a cell: its points, or on a task that
 * gives none how many tests it passed; and what stopped its run before its
 * tests, when something did.
 */
export function sideWords(side: RegradeSide | null): string {
  if (side === null) return '—';
  const stopped = side.stopped === null ? null : verdictLabel(side.stopped);
  const tally =
    side.points !== null
      ? `${formatExact(side.points, 2)} ${side.points === '1' ? 'point' : 'points'}`
      : `${String(side.accepted)} of ${String(side.tests)} tests passed`;
  return stopped === null ? tally : `${stopped}, ${tally}`;
}

/** The kind of a submission's change on the feed read by regrade, in words. */
export function changeOf(entry: FeedEntry): string | null {
  const change = entry.grading.change;
  if (change === null) return null;
  if (change.change === 'stopped') {
    const stop = change.now?.stopped ?? null;
    const words = stop === null ? undefined : STOPPED[stop];
    return words === undefined ? CHANGE_WORDS.stopped : capitalised(words[0]);
  }
  return CHANGE_WORDS[change.change];
}

function capitalised(words: string): string {
  return words.charAt(0).toUpperCase() + words.slice(1);
}
