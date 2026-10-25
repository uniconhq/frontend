import type { RunShown } from '@/api/types';

/** A number of submissions in words: "1 submission", "10 submissions". */
export function submissionsWords(count: number): string {
  return `${String(count)} ${count === 1 ? 'submission' : 'submissions'}`;
}

/**
 * How a run names the rows it came from: one piece per axis, joined with
 * " · ". A tuple with a title shows that title; one without shows that
 * axis's columns, a number as "seed 2" and a file by its name.
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
