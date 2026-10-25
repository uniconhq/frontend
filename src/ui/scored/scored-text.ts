import type { RunShown } from '@/api/types';

/** A number of submissions in words: "1 submission", "10 submissions". */
export function submissionsWords(count: number): string {
  return `${String(count)} ${count === 1 ? 'submission' : 'submissions'}`;
}

/**
 * Why a submission past the task's limit was not graded (#445), said to the
 * entrant ("you") or of them ("the entrant"): it was graded again after a
 * delay, when they already had as many submissions with a result as the
 * task takes.
 */
/**
 * How a run names the rows it came from: each tuple's title, joined with
 * " · ", and a tuple with none by its key. A number is "seed 2"; a file is
 * its name.
 */
export function tupleLine(titles: RunShown['titles'], key: RunShown['key']): string {
  const named = titles ?? [];
  const entries = Object.entries(key);
  const count = Math.max(named.length, entries.length);
  const parts: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const title = named[index];
    if (typeof title === 'string' && title !== '') {
      parts.push(title);
      continue;
    }
    const entry = entries[index];
    if (entry === undefined) continue;
    const shown = keyText(entry[0], entry[1]);
    if (shown !== '') parts.push(shown);
  }
  return parts.join(' · ');
}

function keyText(name: string, value: unknown): string {
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

export function overLimitSentence(who: string, limit: number | null): string {
  const most = limit === null ? 'submissions' : submissionsWords(limit);
  return `Not graded: ${who} had reached the limit of ${most} for this task.`;
}
