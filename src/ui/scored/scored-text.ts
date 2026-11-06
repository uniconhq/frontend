import type { GradingResult, RunShown } from '@/api/types';

/** `of` for the first run of a submission that did not pass. */
export const FIRST_NOT_PASSED = 'first_not_passed';

/** The runs under each entry's `of`, in the order they first come. */
export function groupsOf<Run extends { group: string }>(
  runs: Run[],
): { name: string; runs: Run[] }[] {
  const order: string[] = [];
  const by = new Map<string, Run[]>();
  for (const run of runs) {
    const list = by.get(run.group);
    if (list === undefined) {
      order.push(run.group);
      by.set(run.group, [run]);
    } else {
      list.push(run);
    }
  }
  return order.map((name) => ({ name, runs: by.get(name) ?? [] }));
}

/** What an entry's runs are headed: its group, or what the first run not passed is. */
export function entryTitle(of: string): string {
  return of === FIRST_NOT_PASSED ? 'First test not passed' : of;
}

/**
 * What a run is called: its place under its entry, or, for the first run
 * not passed, the place it has in its own group.
 */
export function runTitle(run: {
  place: number;
  labelled?: RunShown['labelled'];
}): string {
  const at = run.labelled ?? null;
  if (at === null) return `Test ${String(run.place)}`;
  return at.group === 'all'
    ? `Test ${String(at.place)}`
    : `Test ${String(at.place)} of ${at.group}`;
}

/** A number of submissions in words: "1 submission", "10 submissions". */
export function submissionsWords(count: number): string {
  return `${String(count)} ${count === 1 ? 'submission' : 'submissions'}`;
}

/**
 * How a run names the rows it came from: one piece per axis, joined with
 * " · ". A tuple with a title shows that title; one without shows that
 * axis's columns, a number as "seed 2" and a file or folder by its name.
 */
export function tupleLine(tuples: RunShown['tuples']): string {
  const parts: string[] = [];
  for (const tuple of tuples) {
    if (typeof tuple.title === 'string' && tuple.title !== '') {
      parts.push(tuple.title);
      continue;
    }
    for (const [name, value] of Object.entries(tuple.key)) {
      const shown = keyText(name, value);
      if (shown !== '') parts.push(shown);
    }
  }
  return parts.join(' · ');
}

/** How a shown output is named: its title, and its unit in parentheses. */
export function reportLabel(title: string, unit: string | null): string {
  return unit !== null && unit !== '' ? `${title} (${unit})` : title;
}

/**
 * An input shown as a file or a folder, `{file: <path>}` or `{folder: <path>}`,
 * by its path; null for one shown as a number or text.
 */
export function shownPath(value: unknown): { path: string; folder: boolean } | null {
  if (value === null || typeof value !== 'object') return null;
  if ('file' in value && typeof value.file === 'string')
    return { path: value.file, folder: false };
  if ('folder' in value && typeof value.folder === 'string')
    return { path: value.folder, folder: true };
  return null;
}

/** The last part of a path, a folder's with its slash. */
export function pathName(found: { path: string; folder: boolean }): string {
  const name = found.path.replace(/\/+$/, '').split('/').pop() ?? found.path;
  return found.folder ? `${name}/` : name;
}

function keyText(name: string, value: unknown): string {
  const path = shownPath(value);
  if (path !== null) return pathName(path);
  if (typeof value === 'string') {
    const slash = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
    return slash === -1 ? value : value.slice(slash + 1);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return `${name} ${String(value)}`;
  }
  if (value !== null && typeof value === 'object' && 'part' in value) {
    const part = value.part;
    return typeof part === 'number' ? `Part ${String(part)}` : name;
  }
  return name;
}

/**
 * Why a submission past the task's limit was not graded (#445), said to the
 * entrant ("you") or of them ("the entrant"): it was graded again after a
 * delay, when they already had as many submissions with a result as the
 * task takes.
 */
export function overLimitSentence(who: string, limit: number | null): string {
  const most = limit === null ? 'submissions' : submissionsWords(limit);
  return `Not graded: ${who} had reached the limit of ${most} for this task.`;
}

/**
 * What an entrant reads under a delayed grading's badge (#442): the grading
 * failed on Unicon's side, which says nothing of their submission, so no
 * more than the wait already says of a hidden step.
 */
export const DELAYED_SENTENCE =
  "A problem on Unicon's side. Nothing is lost, and it does not use up a submission.";

/**
 * Why the organisers cancelled the grading, in their words: the sentence a
 * cancelled grading carries, or null on any other status or with none given.
 */
export function cancelReason(grading: GradingResult): string | null {
  if (grading.status !== 'cancelled') return null;
  return grading.reason === null || grading.reason === '' ? null : grading.reason;
}
