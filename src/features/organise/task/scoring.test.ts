import { describe, expect, it } from 'vitest';
import { formatExact, ratioOf, ZERO } from '@/lib/exact';
import type { GroupValues } from '../forms/task-values';
import {
  NO_POINTS,
  groupHeading,
  groupSentence,
  groupWeight,
  groupsLine,
  pointsWords,
  readsWeights,
  ruleOf,
  ruleRefusal,
  scaled,
  scalingSentence,
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
    expect(ruleRefusal('worst', 'none')).toMatch(
      /Only available when a test can earn part/,
    );
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

  it('says a task that gives no points, and the scaling to the contest’s worth, in one set of words', () => {
    expect(totalSentence(ZERO, r('100'))).toBe(NO_POINTS);
    expect(NO_POINTS).toBe(
      'The task gives no points: no group earns any. It is ranked on what its workflow reports, if a leaderboard says so.',
    );
    expect(scalingSentence(r('50'))).toBe(
      `Its contest makes the task worth ${formatExact('50')} points, so each test group's points are scaled to that.`,
    );
    expect(scalingSentence(r('1'))).toBe(
      "Its contest makes the task worth 1 point, so each test group's points are scaled to that.",
    );
    expect(totalSentence(r('100'), r('50'))).toBe(
      `Total: ${formatExact('100')} points here. ${scalingSentence(r('50'))}`,
    );
    expect(totalSentence(r('1'), null)).toBe('Total: 1 point.');
    expect(pointsWords({ num: 2n, den: 2n })).toBe('1 point');
    expect(pointsWords({ num: 1n, den: 3n })).toBe(
      `about ${formatExact('0.33')} points`,
    );
  });

  it('scales each group to the contest’s worth, exactly', () => {
    const groups = [group('a', { pass: '30' }), group('b', { pass: '90' })];
    expect(scaled(r('30'), taskWeight(groups), r('100'))).toEqual(r('25'));
    expect(totalSentence(taskWeight(groups), r('100'))).toMatch(
      /Its contest makes the task worth 100 points, so each test group's points are scaled/,
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
    ).toBe(
      `An entrant earns about ${formatExact('33.33')} points when every test passes, and nothing otherwise.`,
    );
  });

  it('says what each group does in plain words, speaking of an entrant, with a worked example from its tests (M48)', () => {
    const say = (
      g: GroupValues,
      tests: number | null = null,
      credit: 'none' | 'value' | 'relative' = 'none',
    ) => groupSentence(g, { total: r('100'), worth: null, credit, tests });
    expect(say(group('main', { each: '100' }), 4)).toBe(
      'Each test passed earns an equal share, 25. An entrant who passes 3 of 4 gets 75.',
    );
    expect(say(group('small', { pass: '30' }))).toBe(
      'An entrant earns 30 points when every test passes, and nothing otherwise.',
    );
    expect(say(group('small', { pass: '30' }), 3)).toBe(
      'An entrant earns 30 points when every test passes, and nothing otherwise. An entrant who passes 2 of 3 gets nothing.',
    );
    expect(say(group('main', { each: '80', pass: '20' }), 10)).toBe(
      'Each test passed earns an equal share of 80 points. Passing every test earns 20 points more. An entrant who passes 9 of 10 gets 72; one who passes all 10, 100.',
    );
    expect(say(group('core', { pass: '100', passAt: '0.8' }), 5)).toBe(
      'An entrant earns 100 points when at least 80% of its tests pass, and nothing otherwise. An entrant who passes 4 of 5 tests gets 100; one who passes 3, nothing.',
    );
    expect(
      say(
        group('core', {
          pass: '100',
          passAt: '0.8',
          weights: [{ test: '1', weight: '2' }],
        }),
        5,
      ),
    ).toBe(
      'An entrant earns 100 points when at least 80% of its tests pass, counted by weight, and nothing otherwise.',
    );
    const weights = [{ test: '7', weight: '3' }];
    expect(say(group('main', { each: '42', weights }), 10)).toBe(
      'Each test passed earns a share of 42 points by its weight.',
    );
    expect(say(group('main', { each: '42' }), null, 'value')).toBe(
      'Each test earns an equal share of 42 points, times its score from 0 to 1. An entrant whose tests all score 0.5 gets 21.',
    );
    expect(say(group('main', { each: '50' }), 3, 'relative')).toBe(
      'Each test earns an equal share of 50 points, times its result against the best any entrant reached. An entrant who reaches 80% of the best on every test gets 40.',
    );
    expect(say(group('main', { worst: '100' }), null, 'value')).toBe(
      'An entrant earns 100 points times their lowest test score, from 0 to 1. An entrant whose lowest test score is 0.5 gets 50.',
    );
    expect(say(group('samples'))).toBe('Its tests are for entrants to practise on.');
    expect(
      say(
        group('mix', { each: '50', worst: '30', pass: '20', passAt: '0.8' }),
        4,
        'value',
      ),
    ).toBe(
      'An entrant earns 50 points shared among the tests, each times its score from 0 to 1, plus 30 points times the lowest test score, plus 20 points when at least 80% of the tests pass. An entrant whose tests all score 0.5 gets 40 (25 + 15 + 0).',
    );
  });

  it('says a hand-set mix part by part in the simple rules’ words, the parts adding up, with a worked example from its tests (M59)', () => {
    const say = (
      g: GroupValues,
      tests: number | null,
      credit: 'none' | 'value' | 'relative' = 'none',
    ) => groupSentence(g, { total: r('210'), worth: null, credit, tests });
    const mix = group('main', { each: '100', worst: '10', pass: '100', passAt: '0.8' });
    expect(say(mix, 3)).toBe(
      `An entrant earns 100 points shared among the tests passed, plus 10 points times the lowest test score, plus 100 points when at least 80% of the tests pass. An entrant who passes 2 of 3 gets about ${formatExact('66.66')} (${formatExact('66.66')} + 0 + 0); one who passes all 3 gets 210.`,
    );
    // Enough tests pass for the bar: its part counts in the example.
    expect(say(group('main', { each: '60', pass: '40', passAt: '0.5' }), 4)).toBe(
      'An entrant earns 60 points shared among the tests passed, plus 40 points when at least 50% of the tests pass. An entrant who passes 3 of 4 gets 85 (45 + 40); one who passes all 4 gets 100.',
    );
    expect(say(mix, null)).toBe(
      'An entrant earns 100 points shared among the tests passed, plus 10 points times the lowest test score, plus 100 points when at least 80% of the tests pass.',
    );
    expect(say(group('main', { each: '50', worst: '50' }), 4, 'relative')).toBe(
      'An entrant earns 50 points shared among the tests, each times its result against the best any entrant reached, plus 50 points times the lowest test score. An entrant who reaches 80% of the best on every test gets 80 (40 + 40).',
    );
    // Weighted tests: the parts say so, and no example is worked out.
    expect(
      say(
        group('main', {
          each: '50',
          pass: '50',
          passAt: '0.5',
          weights: [{ test: '1', weight: '2' }],
        }),
        4,
      ),
    ).toBe(
      'An entrant earns 50 points shared among the tests passed, by weight, plus 50 points when at least 50% of the tests pass, counted by weight.',
    );
  });

  it('says the groups first in one line, and heads each with its size and points before its rule (M65)', () => {
    const ioi = [
      group('samples'),
      group('small', { pass: '40' }),
      group('large', { pass: '60' }),
    ];
    expect(groupsLine(ioi, null)).toBe(
      'Three test groups: samples (0 points), small (40) and large (60).',
    );
    expect(groupsLine([group('main', { each: '100' })], null)).toBe(
      'One test group: main, 100 points.',
    );
    expect(groupsLine(ioi, r('50'))).toBe(
      'Three test groups: samples (0 points), small (20) and large (30).',
    );
    expect(groupsLine([], null)).toBe('It has no test groups.');
    const context = { total: r('100'), worth: null };
    expect(
      groupSentence(group('main', { each: '100' }), {
        ...context,
        credit: 'none',
        tests: 1,
      }),
    ).toBe('Its one test earns 100 points when it passes.');
    expect(groupHeading(ioi[1]!, { ...context, tests: 3 })).toBe('3 tests, 40 points');
    expect(groupHeading(ioi[0]!, { ...context, tests: 1 })).toBe('1 test, no points');
    expect(groupHeading(ioi[2]!, { ...context, tests: null })).toBe('60 points');
    expect(
      groupSentence(group('main', { each: '100' }), {
        ...context,
        credit: 'none',
        tests: 3,
      }),
    ).toBe(
      `Each test passed earns an equal share, about ${formatExact('33.33')}. An entrant who passes 2 of 3 gets about ${formatExact('66.66')}.`,
    );
  });

  it('never speaks to the reader as you, and never names the group', () => {
    const rules: Partial<GroupValues>[] = [
      {},
      { pass: '30' },
      { pass: '100', passAt: '0.8' },
      { each: '100' },
      { each: '80', pass: '20' },
      { worst: '70' },
      { each: '50', worst: '50' },
    ];
    for (const credit of ['none', 'value', 'relative'] as const) {
      for (const weights of rules) {
        const said = groupSentence(group('zebra', weights), {
          total: r('100'),
          worth: null,
          credit,
          tests: 4,
        });
        expect(said).not.toMatch(/\byou(r)?\b/i);
        expect(said).not.toContain('zebra');
      }
    }
  });
});
