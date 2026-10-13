import { $api } from '@/api/query';
import type {
  FeedEntry,
  RegradeChange,
  RegradeChangeKind,
  RegradeSide,
  RegradeSummary,
  ValueMeaning,
} from '@/api/types';
import { useFallbackPoll } from '@/live';
import { formatExact, formatPoints, withPointsWord } from '@/lib/exact';
import { meaningOf, titleInSentence, withUnit } from '@/lib/values';
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
 * One count of a regrade's summary as it reads: its words, the kind of
 * change its link filters Gradings to, null for every submission it took,
 * and whether it is a link, which a count is only where the list it opens
 * holds just those submissions.
 */
export type SummaryPart = {
  key: string;
  words: string;
  change: RegradeChangeKind | null;
  linked: boolean;
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

/** What stopped a run before its tests, as a result reads in a sentence. */
const STOPPED_RESULT: Partial<Record<string, string>> = {
  compile_error: 'Failed to compile',
  time_limit: 'Ran out of time before its tests',
  memory_limit: 'Ran out of memory before its tests',
  output_limit: 'Wrote too much before its tests',
  runtime_error: 'Crashed before its tests',
};

/**
 * How many of the submissions a regrade now stops before their tests
 * stopped on what, from those the feed listed of them (`stops`, each
 * submission's new result's stop); the rest, or all while they are not
 * read yet, said as stopping before their tests. One count, since Gradings
 * lists them together.
 */
function stoppedPart(count: number, stops: (string | null)[] | null): SummaryPart {
  const known = (stops ?? []).slice(0, count);
  const tally = new Map<string, number>();
  for (const stop of known) {
    const words = stop === null ? undefined : STOPPED[stop];
    const key = words === undefined ? '' : (stop ?? '');
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  const rest = count - known.length;
  if (rest > 0) tally.set('', (tally.get('') ?? 0) + rest);
  const words = [...tally].map(([stop, many]) => {
    const [one, several] = STOPPED[stop] ?? STOPPED_ANYHOW;
    return counted(many, one, several);
  });
  return { key: 'stopped', words: words.join(', '), change: 'stopped', linked: true };
}

/**
 * A regrade's summary as its counts, in the order an organiser reads them
 * (#448): how many it graded, then what got worse, what failed or was not
 * graded, and what got better or was graded for the first time; a count of
 * 0 is left out, and so are the unchanged, which "graded" holds. "120
 * graded · 4 went down · 2 now fail to compile · 1 went up". Those still
 * being graded are said apart, by `runningWords`. "Graded" links every
 * submission the regrade took only while that is all it graded.
 */
export function summaryParts(
  summary: RegradeSummary,
  stops: (string | null)[] | null = null,
): SummaryPart[] {
  const { counts } = summary;
  const parts: SummaryPart[] = [
    {
      key: 'graded',
      words: `${String(summary.graded)} graded`,
      change: null,
      linked: summary.graded === summary.total,
    },
  ];
  const add = (change: RegradeChangeKind, words: string) =>
    parts.push({
      key: change,
      words: `${String(counts[change])} ${words}`,
      change,
      linked: true,
    });
  if (counts.down > 0) add('down', 'went down');
  if (counts.stopped > 0) parts.push(stoppedPart(counts.stopped, stops));
  if (counts.failed > 0) add('failed', 'failed on Unicon’s side');
  if (counts.over_limit > 0) add('over_limit', 'not graded, over the limit');
  if (counts.up > 0) add('up', 'went up');
  if (counts.new > 0) add('new', 'graded for the first time');
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

/** A result's share of its tests passed, null where it has no tests. */
function shareOf(side: RegradeSide): number | null {
  return side.tests === 0 ? null : side.accepted / side.tests;
}

/**
 * The values that decided a regrade's change, where nothing before them did,
 * as the forge decides it: neither result with points to compare and both
 * with the same share of tests passed, the values that differ; none for any
 * other change.
 */
export function decidingValues(change: RegradeChange): string[] {
  const { earlier, now } = change;
  if (earlier === null || now === null) return [];
  if (change.change !== 'up' && change.change !== 'down') return [];
  if (earlier.points !== null && now.points !== null) return [];
  const [before, after] = [shareOf(earlier), shareOf(now)];
  if (before !== null && after !== null && before !== after) return [];
  const names = new Set([...Object.keys(earlier.values), ...Object.keys(now.values)]);
  return [...names].filter((name) => earlier.values[name] !== now.values[name]);
}

/**
 * The words a publication of a task froze for its values, read only when
 * `wanted`; none while they are read, or where they do not read, so the
 * values go by their keys.
 */
export function usePublicationMeanings(
  path: { org: string; contest: string },
  task: string | null,
  publication: number,
  wanted: boolean,
): readonly ValueMeaning[] {
  const query = $api.useQuery(
    'get',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/publications',
    { params: { path: { ...path, task: task ?? '' } } },
    { enabled: wanted && task !== null },
  );
  return query.data?.find((each) => each.number === publication)?.meanings ?? [];
}

/** One value a result was compared on, "run time 28 ms", or "no run time". */
function valueWords(
  side: RegradeSide,
  name: string,
  meanings: readonly ValueMeaning[],
) {
  const meaning = meaningOf(meanings, name);
  const value = side.values[name];
  return value === undefined
    ? `no ${titleInSentence(name, meaning)}`
    : `${titleInSentence(name, meaning)} ${withUnit(formatExact(value), meaning)}`;
}

/**
 * One result a regrade compares, in a cell: its points, or on a task that
 * gives none how many tests it passed; what stopped its run before its
 * tests, when something did; and the `values` that decided the change, by
 * their titles and units where the meanings give them.
 */
export function sideWords(
  side: RegradeSide | null,
  values: { names: string[]; meanings: readonly ValueMeaning[] } | null = null,
): string {
  if (side === null) return '—';
  const stopped =
    side.stopped === null
      ? null
      : (STOPPED_RESULT[side.stopped] ?? 'Stopped before its tests');
  const tally =
    side.points !== null
      ? withPointsWord(formatPoints(side.points))
      : `${String(side.accepted)} of ${String(side.tests)} tests passed`;
  const compared = (values?.names ?? []).map((name) =>
    valueWords(side, name, values?.meanings ?? []),
  );
  return [...(stopped === null ? [] : [stopped]), tally, ...compared].join(', ');
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
