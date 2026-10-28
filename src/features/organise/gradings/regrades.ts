import { $api } from '@/api/query';
import type { FeedEntry, RegradeChangeKind, RegradeSummary } from '@/api/types';
import { useFallbackPoll } from '@/live';
import { formatDateTime } from '@/lib/time';
import { FAILED_WORDS } from './feed';

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

/** A count with its verb agreeing: "1 submission is", "2 submissions are". */
function counted(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/**
 * A regrade's summary as its counts, in the order an organiser reads them
 * (#448): how many it graded, then what failed or was not graded, and what
 * was graded for the first time; a count of 0 is left out, and so are the
 * regraded, which "graded" holds. "120 graded · 2 failed on Unicon's side".
 * Those still being graded are said apart, by `runningWords`. "Graded" links
 * every submission the regrade took only while that is all it graded.
 */
export function summaryParts(summary: RegradeSummary): SummaryPart[] {
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
  if (counts.failed > 0) add('failed', 'failed on Unicon’s side');
  if (counts.over_limit > 0) add('over_limit', 'not graded, over the limit');
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
  regraded: 'Graded again, over an earlier result',
  new: 'Graded for the first time',
  running: 'Still being graded',
  failed: FAILED_WORDS,
  over_limit: 'Not graded, over the limit',
};

/**
 * The kind of a submission's change on the feed read by regrade, in words,
 * with the attempt that counted when the regrade began and its own attempt,
 * by number: "Graded again, over an earlier result (attempt 1 → attempt 2)".
 */
export function changeOf(change: FeedEntry['grading']['change']): string | null {
  if (change === null) return null;
  const words = CHANGE_WORDS[change.change];
  const { earlier, now } = change;
  if (earlier !== null && now !== null)
    return `${words} (attempt ${String(earlier)} → attempt ${String(now)})`;
  if (now !== null) return `${words} (attempt ${String(now)})`;
  if (earlier !== null) return `${words} (attempt ${String(earlier)} counted before)`;
  return words;
}
