import type { GroupValues, InputValues, TaskValues } from '../forms/task-values';
import type { Staged } from './staged';

/**
 * What a save of the task's cards would change, a line each in words, for
 * the save bar to list before anything is saved: the workflow, each input by
 * its title, how a test earns, each group's rule, when it is shown and its
 * test weights, the tests added, replaced and taken out of each group, and
 * the submission rules.
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
  ]);
}

function count(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

function groupLines(
  was: GroupValues | undefined,
  now: GroupValues | undefined,
): string[] {
  if (was === undefined && now !== undefined) return [`New test group ${now.name}`];
  if (now === undefined && was !== undefined) {
    return was.read ? [`Test group ${was.name} removed`] : [];
  }
  if (was === undefined || now === undefined) return [];
  const lines: string[] = [];
  const rule = (group: GroupValues) =>
    [group.each, group.worst, group.pass, group.passAt].join('|');
  if (rule(was) !== rule(now)) lines.push(`${now.name}: how it earns points`);
  if (was.show !== now.show) lines.push(`${now.name}: when entrants see results`);
  if (JSON.stringify(was.weights) !== JSON.stringify(now.weights)) {
    lines.push(`${now.name}: test weights`);
  }
  if (!was.read && lines.length === 0) lines.push(`${now.name}: added to scoring`);
  return lines;
}

export function changeLines(
  before: TaskValues,
  after: TaskValues,
  staged: Staged,
  titles: ReadonlyMap<string, string>,
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
    else if (was === undefined || held(was) !== held(now) || now.shape !== now.kind) {
      lines.push(`Inputs: ${name}`);
    }
  }
  if (JSON.stringify(before.credit) !== JSON.stringify(after.credit)) {
    lines.push('How a test earns');
  }
  const groups = [
    ...new Set([...before.groups, ...after.groups].map((group) => group.name)),
  ];
  for (const name of groups) {
    lines.push(
      ...groupLines(
        before.groups.find((group) => group.name === name),
        after.groups.find((group) => group.name === name),
      ),
    );
  }
  const tested = [
    ...new Set([...staged.tests, ...staged.removals].map((test) => test.group)),
  ];
  for (const group of tested) {
    const changed = staged.tests.filter((test) => test.group === group);
    const added = changed.filter((test) => test.existing.length === 0).length;
    const replaced = changed.length - added;
    const removed = staged.removals.filter((test) => test.group === group).length;
    const parts = [
      added > 0 ? `${count(added, 'test', 'tests')} added` : null,
      replaced > 0 ? `${count(replaced, 'test', 'tests')} replaced` : null,
      removed > 0 ? `${count(removed, 'test', 'tests')} removed` : null,
    ].filter((part): part is string => part !== null);
    lines.push(`Tests of ${group}: ${parts.join(', ')}`);
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
