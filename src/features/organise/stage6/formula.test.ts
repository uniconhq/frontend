import { describe, expect, it } from 'vitest';
import {
  checkFormula,
  contextAt,
  describeFormula,
  namesIn,
  parseFormula,
  piecesOf,
  printFormula,
  type FormulaNode,
  type FormulaScope,
} from './formula';

const task: FormulaScope = {
  where: 'task',
  names: ['st1', 'st2', 'sample_score', 'seconds_late', 'first_failed'],
  each: ['sample_tests.passed', 'sample_tests.time_ms', 'sample_tests.verdict'],
  sets: ['sample_tests', 'all'],
  texts: ['first_failed', 'sample_tests.verdict'],
  fields: { passed: 'number', time_ms: 'number', verdict: 'text' },
};

const leaderboard: FormulaScope = {
  where: 'leaderboard',
  names: ['islands_last.total'],
  each: ['islands.total'],
  sets: ['islands'],
  fields: { total: 'number', first_failed: 'text' },
};

function parsed(text: string): FormulaNode {
  const result = parseFormula(text);
  if (!result.ok) throw new Error(result.message);
  return result.node;
}

function messages(text: string, scope: FormulaScope): string[] {
  return checkFormula(parsed(text), scope).problems.map((problem) => problem.message);
}

function kind(text: string, scope: FormulaScope) {
  return checkFormula(parsed(text), scope).kind;
}

describe('parseFormula', () => {
  it.each([
    '40 * st1 + 60 * st2',
    '(40 + st1) * st2',
    'sum(sample_tests.passed) / count(sample_tests)',
    'if(seconds_late > 0, st1 * 9 / 10, st1)',
    'not st1 == 1 and st2 >= 1 or ?',
    '(st1 < st2) == 1',
    'otherwise(first(all, all.passed == 0).verdict, "none")',
    'highest(sample_tests, sample_tests.time_ms).time_ms + 1',
  ])('round-trips %s', (text) => {
    expect(printFormula(parsed(text))).toBe(text);
  });

  it('keeps where each part sat in the line', () => {
    const node = parsed('st1 + first(all).verdict');
    expect(node.span).toEqual({ from: 0, to: 24 });
    if (node.kind !== 'op') throw new Error('an op');
    expect(node.args[1]?.span).toEqual({ from: 6, to: 24 });
  });

  it('says where a line cannot be read', () => {
    expect(parseFormula('st1 + "none')).toMatchObject({ ok: false, at: 6 });
    expect(parseFormula('st1 = 2')).toMatchObject({ ok: false, at: 4 });
  });
});

describe('checkFormula', () => {
  it('reads every block of the spec without a problem', () => {
    expect(
      messages(
        'min(sample_tests.passed) * 40 + if(seconds_late > 0, 0, floor(max(sample_tests.time_ms) / 1000))',
        task,
      ),
    ).toEqual([]);
  });

  it('names an unknown name, the wrong number of inputs, and a per-run name outside a fold', () => {
    expect(
      messages('sum(sample_tests.passed, st1) + mystery + sample_tests.time_ms', task),
    ).toEqual([
      'takes 1 input, and this has 2',
      'not a name you can use here',
      'one per run, so it sits inside sum, min, max, count or a pick',
    ]);
  });

  it('says a group is not a number, and count takes a group', () => {
    expect(messages('sample_tests + count(st1)', task)).toEqual([
      'a group, not a number: count its runs, or fold one of its columns',
      'count takes a group, such as sample_tests',
    ]);
  });

  it('gives text from a run pick, a text value, and if or otherwise', () => {
    expect(kind('first(all, all.passed == 0).verdict', task)).toBe('text');
    expect(kind('otherwise(first(all, all.passed == 0).verdict, "none")', task)).toBe(
      'text',
    );
    expect(kind('if(first_failed == "none", 1, 0)', task)).toBe('number');
    expect(kind('count(all, all.verdict != "OK")', task)).toBe('number');
  });

  it('keeps text out of maths, and a number and text apart', () => {
    expect(messages('first_failed + 1', task)).toEqual(['text, and + takes a number']);
    expect(messages('st1 == "OK"', task)).toEqual(['compares text with a number']);
    expect(messages('if(st1 > 0, "yes", 0)', task)).toEqual([
      'if gives a number one way and text the other',
    ]);
  });

  it('asks a task to read a column off a pick, and knows the columns', () => {
    expect(messages('first(all)', task)).toEqual([
      'a pick gives a run, not a number or text: read one of its columns, such as .verdict',
    ]);
    expect(messages('last(all).colour', task)).toEqual(['not a column of a run']);
    expect(messages('st1.passed', task)).toEqual(['not a name you can use here']);
  });

  it('allows a pick as a whole column or as the test of an if', () => {
    expect(messages('latest(islands)', leaderboard)).toEqual([]);
    expect(messages('if(latest(islands), 1, 0)', leaderboard)).toEqual([]);
    expect(messages('highest(islands, islands.total).total * 2', leaderboard)).toEqual(
      [],
    );
    expect(messages('latest(islands) * 2', leaderboard)).toEqual([
      'a pick gives a submission, not a number or text: read one of its values, such as .total',
    ]);
  });

  it('says where something is still to go', () => {
    expect(messages('st1 + ?', task)).toEqual(['something goes here']);
  });
});

describe('piecesOf', () => {
  it('colours names, blocks, columns and text, even on a half-typed line', () => {
    const pieces = piecesOf('first(all).verdict == "OK" and fir', task)
      .filter((piece) => piece.kind !== 'space')
      .map((piece) => `${piece.kind}:${piece.text}`);
    expect(pieces).toEqual([
      'block:first',
      'symbol:(',
      'set:all',
      'symbol:)',
      'field:.verdict',
      'symbol:=',
      'symbol:=',
      'text:"OK"',
      'symbol:and',
      'unknown:fir',
    ]);
  });
});

describe('contextAt', () => {
  it('wants a group first in count or a pick, and a run value inside', () => {
    expect(contextAt('count(sa', 8, task)).toMatchObject({
      from: 6,
      typed: 'sa',
      want: 'set',
      each: false,
    });
    expect(contextAt('first(all, ', 11, task)).toMatchObject({
      want: 'value',
      each: true,
    });
    expect(contextAt('st1 + ', 6, task)).toMatchObject({ want: 'value', each: false });
  });

  it('wants a column after a pick', () => {
    expect(contextAt('first(all).ve', 13, task)).toEqual({
      from: 11,
      typed: 've',
      want: 'field',
      each: false,
    });
  });

  it('looks past a closed call and a quoted comma', () => {
    expect(contextAt('sum(if(st1 > 0, 1, 0) + ', 24, task)).toMatchObject({
      each: true,
    });
    expect(contextAt('if(x == ",", ', 13, task)).toMatchObject({ each: false });
  });
});

describe('describeFormula', () => {
  it.each([
    ['sum(sample_tests.passed)', 'Add up passed over the runs in sample_tests.'],
    ['40 * st1 + 60 * st2', '40 times st1 plus 60 times st2.'],
    ['(40 + st1) * st2', '(40 plus st1) times st2.'],
    [
      'otherwise(first(all, all.passed == 0).verdict, "none")',
      'The verdict of the first run in all where passed is 0, or “none” when that is missing.',
    ],
    ['count(sample_tests)', 'How many runs sample_tests has.'],
  ])('reads %s', (text, words) => {
    expect(describeFormula(parsed(text), task)).toBe(words);
  });
});

describe('namesIn', () => {
  it('lists what a formula reads, not the columns read off a pick', () => {
    expect(
      namesIn(parsed('otherwise(first(all, all.passed == 0).verdict, "none") == st1')),
    ).toEqual(['all', 'all.passed', 'st1']);
  });
});
