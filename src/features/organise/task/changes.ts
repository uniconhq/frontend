import type { InputValues, TaskValues } from '../forms/task-values';

/**
 * What a save of the task's cards would change, a line each in words, for
 * the save bar to list before anything is saved: the workflow, each input by
 * its title, the runs, the scoring, the checks and the submission rules.
 */

/** An input's fields that say what it holds, without how it was read. */
function held(input: InputValues): string {
  const {
    id,
    kind,
    label,
    options,
    default: first,
    min,
    max,
    maxSize,
    value,
    secret,
    give,
  } = input;
  return JSON.stringify([
    id,
    kind,
    label,
    options,
    first,
    min,
    max,
    maxSize,
    value,
    secret,
    give,
  ]);
}

/** The lines of a save; `newFiles` are the settings given a new file, each said once as such. */
export function changeLines(
  before: TaskValues,
  after: TaskValues,
  titles: ReadonlyMap<string, string>,
  newFiles: readonly string[] = [],
): string[] {
  const lines: string[] = [];
  if (before.name !== after.name) lines.push('Title');
  if (before.workflow.trim() !== after.workflow.trim()) {
    lines.push(
      before.workflow.trim() === ''
        ? `Workflow: ${after.workflow.trim()}`
        : `Workflow: ${before.workflow.trim()} to ${after.workflow.trim()}`,
    );
  }
  const ids = [
    ...new Set([...before.inputs, ...after.inputs].map((input) => input.id)),
  ];
  for (const id of ids) {
    const was = before.inputs.find((input) => input.id === id);
    const now = after.inputs.find((input) => input.id === id);
    const name = titles.get(id) ?? id;
    if (now === undefined) lines.push(`Inputs: ${name} removed`);
    else if (newFiles.includes(id)) lines.push(`Inputs: ${name}, a new file`);
    else if (was === undefined || held(was) !== held(now) || now.shape !== now.kind) {
      lines.push(`Inputs: ${name}`);
    }
  }
  if (JSON.stringify(before.axes) !== JSON.stringify(after.axes)) {
    lines.push('Runs');
  }
  if (
    JSON.stringify(before.scoreGroups) !== JSON.stringify(after.scoreGroups) ||
    JSON.stringify(before.scoreValues) !== JSON.stringify(after.scoreValues) ||
    JSON.stringify(before.show) !== JSON.stringify(after.show)
  ) {
    lines.push('Scoring');
  }
  if (JSON.stringify(before.checks) !== JSON.stringify(after.checks)) {
    lines.push('Checks');
  }
  if (
    before.max !== after.max ||
    before.rateCount !== after.rateCount ||
    before.ratePer !== after.ratePer
  ) {
    lines.push('Submission rules');
  }
  return lines;
}
