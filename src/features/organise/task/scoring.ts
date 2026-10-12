import {
  addRatio,
  compareRatio,
  divRatio,
  formatRatio,
  mulRatio,
  ratioOf,
  ZERO,
  type Ratio,
} from '@/lib/exact';
import { listed } from '@/lib/listed';
import { percentOf } from '../contest/percent';
import type { GroupValues, TaskValues } from '../forms/task-values';

/**
 * How a task scores, in the words its organisers and entrants read
 * (TASK-FORMAT section 3): each test group earns by one rule, its points are
 * its share of what the task is worth, and each says in one sentence what it
 * does, the same sentence an entrant is told. Every number is worked out
 * exactly, as the forge does; only the shown digits round.
 */

/**
 * How a group earns its points, one rule of the few the form offers, or
 * `advanced` for any other mix of the three rule weights, which the form
 * shows as the weights themselves so nothing the format can say is lost.
 */
export type Rule = 'none' | 'all' | 'share' | 'each' | 'bonus' | 'worst' | 'advanced';

/** A test's credit: 1 when accepted, a reported value, or a value over the best. */
export type CreditKind = TaskValues['credit']['kind'];

const set = (text: string) => text.trim() !== '';

/** Whether a pass threshold is every test: unset, or exactly 1. */
function everyTest(passAt: string): boolean {
  const share = ratioOf(passAt);
  return (
    !set(passAt) || (share !== null && compareRatio(share, { num: 1n, den: 1n }) === 0)
  );
}

/**
 * Why a share of tests cannot be saved, or undefined when it can: the format
 * takes a share above none and at most every test.
 */
export function shareProblem(passAt: string): string | undefined {
  if (!set(passAt)) return undefined;
  const share = ratioOf(passAt);
  if (share === null) return undefined;
  return compareRatio(share, ZERO) <= 0 || compareRatio(share, { num: 1n, den: 1n }) > 0
    ? 'Give a share above 0% and at most 100%.'
    : undefined;
}

/** The rule a group's weights say, as the form offers rules. */
export function ruleOf(group: GroupValues): Rule {
  const each = set(group.each);
  const worst = set(group.worst);
  const pass = set(group.pass);
  if (!each && !worst && !pass) return set(group.passAt) ? 'advanced' : 'none';
  if (worst) return !each && !pass && !set(group.passAt) ? 'worst' : 'advanced';
  if (each && pass) return everyTest(group.passAt) ? 'bonus' : 'advanced';
  if (each) return set(group.passAt) ? 'advanced' : 'each';
  return everyTest(group.passAt) ? 'all' : 'share';
}

/** The rules in the order the form offers them, with what each says. */
export const RULES: { value: Exclude<Rule, 'advanced'>; label: string }[] = [
  { value: 'all', label: 'Every test must pass' },
  { value: 'share', label: 'At least a share of its tests must pass' },
  { value: 'each', label: 'Points for each test passed' },
  {
    value: 'bonus',
    label: 'Points for each test passed, and a bonus for passing every one',
  },
  { value: 'worst', label: 'The lowest test score counts' },
  { value: 'none', label: 'No points: for practice' },
];

/**
 * Why the save would refuse a rule here, or null when it would not: the
 * lowest score is for a checker that gives partial scores (T1), since with
 * pass or fail tests it would only say "every test must pass" again.
 */
export function ruleRefusal(rule: Rule, credit: CreditKind): string | null {
  if (rule === 'worst' && credit === 'none') {
    return 'Only available when a test can earn part of its points. Set how a test earns first.';
  }
  return null;
}
/** The weight a rule's points box writes to, and its bonus box when it has one. */
function mainWeight(group: GroupValues): string {
  const rule = ruleOf(group);
  if (rule === 'all' || rule === 'share') return group.pass;
  if (rule === 'worst') return group.worst;
  return group.each;
}

/**
 * The group's weights for another rule, its points carried over: the points
 * box keeps its number, or starts at 100 for a group that earned nothing, so
 * the rule chosen holds; a share keeps its threshold or starts at 80%, and a
 * bonus keeps its number. Test weights stay only under a rule that reads
 * them (T2).
 */
export function withRule(group: GroupValues, rule: Rule): GroupValues {
  if (rule === 'advanced') return group;
  const points = set(mainWeight(group)) ? mainWeight(group) : '100';
  const bonus = ruleOf(group) === 'bonus' ? group.pass : '';
  const cleared = { ...group, each: '', worst: '', pass: '', passAt: '' };
  const next: GroupValues =
    rule === 'none'
      ? cleared
      : rule === 'all'
        ? { ...cleared, pass: points }
        : rule === 'share'
          ? {
              ...cleared,
              pass: points,
              passAt: !everyTest(group.passAt) ? group.passAt : '0.8',
            }
          : rule === 'each'
            ? { ...cleared, each: points }
            : rule === 'bonus'
              ? { ...cleared, each: points, pass: bonus }
              : { ...cleared, worst: points };
  return readsWeights(next) ? next : { ...next, weights: [] };
}

/** The group with its points box, under its rule, set to `points`. */
export function withPoints(
  group: GroupValues,
  points: string,
  rule: Rule,
): GroupValues {
  if (rule === 'all' || rule === 'share') return { ...group, pass: points };
  if (rule === 'worst') return { ...group, worst: points };
  return { ...group, each: points };
}

/** The points box of a group under the rule it is shown with. */
export function pointsOf(group: GroupValues, rule: Rule): string {
  if (rule === 'all' || rule === 'share') return group.pass;
  if (rule === 'worst') return group.worst;
  return group.each;
}

/**
 * Whether a group's rule reads test weights: points for each test, or a
 * share of its tests below every one (T2).
 */
export function readsWeights(group: GroupValues): boolean {
  return set(group.each) || (set(group.pass) && !everyTest(group.passAt));
}

/** A weight as typed, as a fraction: zero when empty or not a number. */
function weight(text: string): Ratio {
  return set(text) ? (ratioOf(text) ?? ZERO) : ZERO;
}

/** What a group can earn: the sum of its rule weights. */
export function groupWeight(group: GroupValues): Ratio {
  return addRatio(
    addRatio(weight(group.each), weight(group.worst)),
    weight(group.pass),
  );
}

/** What the task can earn: the sum of its groups' rule weights. */
export function taskWeight(groups: GroupValues[]): Ratio {
  return groups.reduce((total, group) => addRatio(total, groupWeight(group)), ZERO);
}

/**
 * What a contest's worth makes of a rule weight: the worth times the
 * weight's share of the task's, or the weight itself when the contest gives
 * no worth, since a task's worth is then its groups' total (#435).
 */
export function scaled(value: Ratio, total: Ratio, worth: Ratio | null): Ratio {
  if (worth === null || total.num === 0n) return value;
  return mulRatio(worth, divRatio(value, total));
}

/** A number of points for reading, exactly or "about" when it does not end. */
export function pointsText(value: Ratio): string {
  return formatRatio(value);
}

function n(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/** Points in words, exactly or "about" when they do not end: "100 points", "1 point". */
function pointsWords(value: Ratio): string {
  return `${pointsText(value)} ${value.num === value.den ? 'point' : 'points'}`;
}

/** The least whole number of `tests` a share of them comes to, rounded up. */
function leastOf(share: Ratio, tests: number): number {
  const scaledUp = share.num * BigInt(tests);
  return Number((scaledUp + share.den - 1n) / share.den);
}

/**
 * How a group earns its points, in the words an entrant and an organiser
 * both read (M48, M52): `rule`, what earns them, in a sentence or two that
 * speak of "an entrant", never "you", and do not name the group, so a page
 * heads it as it heads its own boxes; and `example`, a worked case from the
 * group's own number of tests where one helps, or null. Its points are as
 * an entrant sees them under the contest's `worth` (none: the task's total).
 * `tests` is how many tests the group has, when known.
 */
export function groupWords(
  group: GroupValues,
  context: {
    total: Ratio;
    worth: Ratio | null;
    credit: CreditKind;
    tests: number | null;
  },
): { rule: string; example: string | null } {
  const { total, worth, credit, tests } = context;
  const real = (text: string) => scaled(weight(text), total, worth);
  const p = (text: string) => pointsWords(real(text));
  const weighted = group.weights.length > 0;
  const many = tests !== null && tests >= 2 ? tests : null;
  const share = weighted ? 'a share by its weight' : 'an equal share';
  const shareOf = (passAt: string) => `${percentOf(passAt)}%`;
  const none = {
    rule: 'No points: its tests are for entrants to practise on.',
    example: null,
  };

  /** Points by each test: passed, scored from 0 to 1, or against the best. */
  const byTest = (each: string): { rule: string; example: string | null } => {
    if (credit === 'value') {
      return {
        rule: `Each test is worth ${share} of ${p(each)}, times its score from 0 to 1.`,
        example: weighted
          ? null
          : `An entrant whose tests all score 0.5 gets ${pointsText(mulRatio(real(each), { num: 1n, den: 2n }))}.`,
      };
    }
    if (credit === 'relative') {
      return {
        rule: `Each test is worth ${share} of ${p(each)}, times its result against the best any entrant reached.`,
        example: weighted
          ? null
          : `An entrant who reaches 80% of the best on every test gets ${pointsText(mulRatio(real(each), { num: 4n, den: 5n }))}.`,
      };
    }
    return {
      rule: `Each test passed is worth ${share} of ${p(each)}.`,
      example:
        weighted || many === null
          ? null
          : `An entrant who passes ${String(many - 1)} of ${String(many)} gets ${pointsText(
              mulRatio(real(each), { num: BigInt(many - 1), den: BigInt(many) }),
            )}.`,
    };
  };

  switch (ruleOf(group)) {
    case 'none':
      return none;
    case 'all':
      return {
        rule: `An entrant earns ${p(group.pass)} when every test passes, and nothing otherwise.`,
        example:
          many === null
            ? null
            : `An entrant who passes ${String(many - 1)} of ${String(many)} gets nothing.`,
      };
    case 'share': {
      const least =
        weighted || tests === null || tests < 1
          ? null
          : leastOf(ratioOf(group.passAt) ?? ZERO, tests);
      return {
        rule: `An entrant earns ${p(group.pass)} when at least ${shareOf(group.passAt)} of its tests pass${weighted ? ', counted by weight' : ''}, and nothing otherwise.`,
        example:
          least === null || tests === null || least < 1
            ? null
            : `An entrant who passes ${String(least)} of ${n(tests, 'test', 'tests')} gets ${pointsText(real(group.pass))}; one who passes ${least === 1 ? 'none' : String(least - 1)}, nothing.`,
      };
    }
    case 'each':
      return byTest(group.each);
    case 'bonus': {
      const each = byTest(group.each);
      return {
        rule: `${each.rule} Passing every test earns ${p(group.pass)} more.`,
        example:
          credit !== 'none' || weighted || many === null
            ? null
            : `An entrant who passes ${String(many - 1)} of ${String(many)} gets ${pointsText(
                mulRatio(real(group.each), {
                  num: BigInt(many - 1),
                  den: BigInt(many),
                }),
              )}; one who passes all ${String(many)}, ${pointsText(addRatio(real(group.each), real(group.pass)))}.`,
      };
    }
    case 'worst':
      return {
        rule: `An entrant earns ${p(group.worst)} times their lowest test score, from 0 to 1.`,
        example: `An entrant whose lowest test score is 0.5 gets ${pointsText(mulRatio(real(group.worst), { num: 1n, den: 2n }))}.`,
      };
    case 'advanced': {
      const perTest =
        credit === 'none'
          ? `shared among the tests passed${weighted ? ' by weight' : ''}`
          : credit === 'value'
            ? `times the ${weighted ? 'weighted ' : ''}mean of its tests' scores`
            : `times the ${weighted ? 'weighted ' : ''}mean of its tests' results against the best any entrant reached`;
      const parts = [
        set(group.each) ? `${p(group.each)} ${perTest}` : null,
        set(group.worst) ? `${p(group.worst)} times their lowest test score` : null,
        set(group.pass)
          ? everyTest(group.passAt)
            ? `${p(group.pass)} when every test passes`
            : `${p(group.pass)} when at least ${shareOf(group.passAt)} of its tests pass`
          : null,
      ].filter((part): part is string => part !== null);
      if (parts.length === 0) return none;
      return { rule: `An entrant earns ${listed(parts)}.`, example: null };
    }
  }
}

/** How a group earns its points, as one passage: its rule, then its worked example. */
export function groupSentence(
  group: GroupValues,
  context: Parameters<typeof groupWords>[1],
): string {
  const { rule, example } = groupWords(group, context);
  return example === null ? rule : `${rule} ${example}`;
}

/**
 * When entrants see a group's results, as the form offers it: each choice by
 * the one name it has everywhere, and what entrants then see.
 */
export const SHOWS = [
  {
    value: 'always',
    label: 'Right away',
    description:
      'Entrants see each test’s result and the group’s points as soon as a submission is graded.',
  },
  {
    value: 'verdict',
    label: 'Pass or fail right away, the tests once the task closes',
    description:
      'Entrants see at once whether the group passed and its points, and each test’s result once the task closes.',
  },
  {
    value: 'after_close',
    label: 'Once the task closes',
    description:
      'Entrants see the group’s name and the most points it gives now, and its results once the task closes.',
  },
];

/**
 * Why the save would refuse showing a group's pass or fail alone (T6): its
 * points would tell how many of its hidden tests passed, unless it earns all
 * or nothing, and relative credit moves them as other rows improve.
 */
export function showRefusal(
  show: string,
  group: GroupValues,
  credit: CreditKind,
): string | null {
  if (show !== 'verdict') return null;
  if (credit === 'relative') {
    return 'Not available while a test earns against the best anyone reached, since its points move as others improve.';
  }
  if (set(group.each) || set(group.worst)) {
    return 'Only available for a test group that earns all or nothing, since its points would reveal how its hidden tests went.';
  }
  return null;
}

/** The task's points in one line: "Total: 100 points". */
export function totalSentence(total: Ratio, worth: Ratio | null): string {
  if (total.num === 0n) {
    return 'The task gives no points: no group earns any. It is ranked on what its workflow reports, if a leaderboard says so.';
  }
  const own = `Total: ${pointsText(total)} ${total.num === total.den ? 'point' : 'points'}`;
  if (worth === null) return `${own}.`;
  return compareRatio(worth, total) === 0
    ? `${own}, as its contest gives it.`
    : `${own} here. Its contest makes the task worth ${pointsText(worth)}, so each test group's points are scaled to that.`;
}
