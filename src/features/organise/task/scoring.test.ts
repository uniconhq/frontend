import { describe, expect, it } from 'vitest';
import { formatExact, ratioOf, ZERO } from '@/lib/exact';
import type { GroupValues } from '../forms/task-values';
import {
  groupSentence,
  groupWeight,
  readsWeights,
  ruleOf,
  ruleRefusal,
  scaled,
  showRefusal,
  taskWeight,
  totalSentence,
  withRule,
} from './scoring';

function group(name: string, weights: Partial<GroupValues> = {}): GroupValues {
  return {
    name,
    read: true,
    folder: true,
    each: '',
    worst: '',
    pass: '',
    passAt: '',
    weights: [],
    show: '',
    ...weights,
  };
}

const r = (text: string) => ratioOf(text) ?? ZERO;

describe('a test group’s rule', () => {
  it.each([
    [{}, 'none'],
    [{ pass: '30' }, 'all'],
    [{ pass: '30', passAt: '1' }, 'all'],
    [{ pass: '100', passAt: '0.8' }, 'share'],
    [{ each: '100' }, 'each'],
    [{ each: '80', pass: '20' }, 'bonus'],
    [{ worst: '70' }, 'worst'],
    [{ each: '50', worst: '50' }, 'advanced'],
    [{ each: '80', pass: '20', passAt: '0.5' }, 'advanced'],
    [{ passAt: '0.5' }, 'advanced'],
  ] as const)('%j is %s', (weights, rule) => {
    expect(ruleOf(group('g', weights))).toBe(rule);
  });

  it('carries the points to another rule, and keeps test weights only where they are read', () => {
    const main = group('main', {
      each: '80',
      pass: '20',
      weights: [{ test: '7', weight: '3' }],
    });
    expect(withRule(main, 'all')).toMatchObject({ pass: '80', each: '', weights: [] });
    expect(withRule(main, 'share')).toMatchObject({ pass: '80', passAt: '0.8' });
    expect(withRule(main, 'share').weights).toEqual(main.weights);
    expect(withRule(withRule(main, 'each'), 'bonus')).toMatchObject({
      each: '80',
      pass: '',
    });
    expect(withRule(main, 'worst')).toMatchObject({ worst: '80', each: '', pass: '' });
    expect(withRule(main, 'none')).toMatchObject({ each: '', worst: '', pass: '' });
    expect(readsWeights(group('g', { pass: '1', passAt: '0.5' }))).toBe(true);
    expect(readsWeights(group('g', { pass: '1' }))).toBe(false);
  });

  it('greys out what the save would refuse, with the reason', () => {
    expect(ruleRefusal('worst', 'none')).toMatch(/Only available when a test can earn part/);
    expect(ruleRefusal('worst', 'value')).toBeNull();
    expect(showRefusal('verdict', group('g', { each: '100' }), 'none')).toMatch(
      /all or nothing/,
    );
    expect(showRefusal('verdict', group('g', { pass: '1' }), 'relative')).toMatch(
      /against the best/,
    );
    expect(
      showRefusal('verdict', group('g', { pass: '100', passAt: '0.8' }), 'none'),
    ).toBeNull();
  });
});

describe('a task’s points', () => {
  const ioi = [
    group('samples'),
    group('small', { pass: '30' }),
    group('large', { pass: '70' }),
  ];

  it('totals its groups, and is worth that total unless its contest says otherwise (#435)', () => {
    expect(taskWeight(ioi)).toEqual(r('100'));
    expect(totalSentence(taskWeight(ioi), null)).toBe(
      `Total: ${formatExact('100')} points.`,
    );
    const small = [group('small', { pass: '3' }), group('large', { pass: '7' })];
    expect(taskWeight(small)).toEqual(r('10'));
    expect(scaled(groupWeight(small[0]!), taskWeight(small), null)).toEqual(r('3'));
  });

  it('scales each group to the contest’s worth, exactly', () => {
    const groups = [group('a', { pass: '30' }), group('b', { pass: '90' })];
    expect(scaled(r('30'), taskWeight(groups), r('100'))).toEqual(r('25'));
    expect(totalSentence(taskWeight(groups), r('100'))).toMatch(
      /Its contest makes the task worth 100, so each test group's points are scaled/,
    );
    const thirds = [
      group('a', { pass: '1' }),
      group('b', { pass: '1' }),
      group('c', { pass: '1' }),
    ];
    expect(
      groupSentence(thirds[0]!, {
        total: taskWeight(thirds),
        worth: r('100'),
        credit: 'none',
        tests: null,
      }),
    ).toBe(`a earns about ${formatExact('33.33')} when every test passes.`);
  });

  it('says what each group does, as an entrant is told (TASK-FORMAT section 3)', () => {
    const say = (
      g: GroupValues,
      tests: number | null = null,
      credit: 'none' | 'value' = 'none',
    ) => groupSentence(g, { total: r('100'), worth: null, credit, tests });
    expect(say(group('small', { pass: '30' }))).toBe(
      'small earns its 30 when every test passes.',
    );
    expect(say(group('main', { each: '80', pass: '20' }), 10)).toBe(
      'main earns 80 times the share of its tests you passed, and 20 more when you pass them all. Passing 9 of 10 tests gets 72; passing all of them, 100.',
    );
    expect(
      say(
        group('core', {
          pass: '100',
          passAt: '0.8',
          weights: [{ test: '1', weight: '2' }],
        }),
      ),
    ).toBe(
      'core earns 100 when at least 80% of its tests pass, counted by test weight.',
    );
    expect(say(group('main', { worst: '100' }), null, 'value')).toBe(
      "main earns 100 times your worst test's score.",
    );
    expect(say(group('samples'))).toBe(
      'samples gives no points; its tests are there to try.',
    );
    expect(
      say(
        group('mix', { each: '50', worst: '30', pass: '20', passAt: '0.8' }),
        4,
        'value',
      ),
    ).toBe(
      "mix earns 50 times the mean of its tests' scores, each from 0 to 1, 30 times your worst test's score and 20 when at least 80% of its tests pass.",
    );
  });
});
