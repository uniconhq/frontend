import { describe, expect, it } from 'vitest';
import { blankBoard, boardScope, givenValues } from '../leaderboards/model';
import { specCatalogue } from './catalogue';
import {
  checkFormula,
  contextAt,
  describeFormula,
  namesIn,
  parseFormula,
  piecesOf,
  readLine,
  spanOf,
  type Ast,
  type FormulaScope,
} from './parse';
import { printFormula } from './print';
import {
  columnProblem,
  limitProblem,
  nameProblem,
  NODE_LIMIT,
  type Tree,
} from './tree';

const catalogue = specCatalogue();

const task: FormulaScope = {
  where: 'task',
  names: ['st1', 'st2', 'sample_score', 'seconds_late', 'first_failed'],
  each: [
    'sample_tests.passed',
    'sample_tests.time_ms',
    'sample_tests.verdict',
    'all.passed',
    'all.verdict',
  ],
  sets: ['sample_tests', 'all'],
  texts: ['first_failed', 'sample_tests.verdict', 'all.verdict'],
  fields: { passed: 'number', time_ms: 'number', verdict: 'text' },
};

/**
 * A leaderboard's scope as the leaderboards page builds it: its column
 * islands_last beside the gradebook, over the task islands, whose settings
 * give total and the texts first_failed, medal (an `if` between texts),
 * badge (reading medal) and first_name (a text input an axis fills); and
 * the task tour, whose medal is a number.
 */
const ISLANDS = `name: Islands
repeat:
  - inputs: [name]
    tuples: [{name: small}, {name: big}]
scoring:
  values:
    total: {block: sum, over: {runs: all}, of: {run: [all, passed]}}
    first_failed:
      block: otherwise
      of: [{run: [{block: first, from: {runs: all}}, verdict]}, {text: none}]
    medal: {block: if, test: {value: total}, then: {text: gold}, else: {text: silver}}
    badge: {value: medal}
    first_name: {run: [{block: first, from: {runs: all}}, name]}
`;
const TOUR = `name: Tour
scoring:
  values:
    medal: 1
`;
const leaderboard: FormulaScope = boardScope(
  {
    ...blankBoard([]),
    key: 'board',
    columns: [{ key: 'c1', name: 'islands_last', line: null, tree: '1' }],
  },
  [{ ...blankBoard([]), key: 'gradebook' }],
  ['tour', 'islands'],
  {
    tour: givenValues(TOUR, new Set()),
    islands: givenValues(
      ISLANDS,
      new Set(['first_failed', 'medal', 'badge', 'first_name']),
    ),
  },
  catalogue.leaderboard_facts,
  [],
);

function parsed(text: string): Ast {
  const result = parseFormula(text);
  if (!result.ok) throw new Error(result.message);
  return result.node;
}

function tree(text: string, scope: FormulaScope = task): Tree {
  return checkFormula(parsed(text), scope, catalogue).tree;
}

function messages(text: string, scope: FormulaScope): string[] {
  return checkFormula(parsed(text), scope, catalogue).problems.map(
    (problem) => problem.message,
  );
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
    'entered(at_least: 0, at_most: 1)',
    'sum(sample_tests.passed, weights: {input: {"tests/7.in": 3}})',
    'count(all, weights: {seed: {1: 2}})',
    'exec("programs/mean/", python, all)',
    'best_each(islands, total, {st1: desc, st2: desc})',
  ])('round-trips %s to the same tree', (text) => {
    const scope = text.startsWith('best_each') ? leaderboard : task;
    const first = tree(text, scope);
    const printed = printFormula(first, catalogue, scope.where);
    expect(tree(printed, scope)).toEqual(first);
  });

  it('writes a text holding a quote or a backslash so it reads back the same', () => {
    const stored: Tree = {
      block: 'otherwise',
      of: [
        { run: [{ block: 'first', from: { runs: 'all' } }, 'verdict'] },
        { text: 'a "b" \\ c' },
      ],
    };
    const printed = printFormula(stored, catalogue, 'task');
    expect(printed).toBe('otherwise(first(all).verdict, "a \\"b\\" \\\\ c")');
    expect(tree(printed)).toEqual(stored);
  });

  it('writes weights keyed by a word a leaf is read by as a map, not as that leaf', () => {
    for (const word of ['name', 'value', 'fact', 'runs', 'results', 'column', 'text']) {
      const stored: Tree = {
        block: 'count',
        over: { runs: 'all' },
        weights: { seed: { [word]: '2' } },
      };
      const printed = printFormula(stored, catalogue, 'task');
      expect(printed).toBe(`count(all, weights: {seed: {"${word}": 2}})`);
      expect(tree(printed)).toEqual(stored);
    }
  });

  it('prints the spec lines as they were written, apart from a named pair', () => {
    expect(printFormula(tree('40 * st1 + 60 * st2'), catalogue, 'task')).toBe(
      '40 * st1 + 60 * st2',
    );
    expect(printFormula(tree('(40 + st1) * st2'), catalogue, 'task')).toBe(
      '(40 + st1) * st2',
    );
    expect(
      printFormula(tree('sum(sample_tests.passed, missing: skip)'), catalogue, 'task'),
    ).toBe('sum(sample_tests.passed, missing: skip)');
    expect(
      printFormula(
        tree('sum(sample_tests.passed, weights: {input: {"tests/7.in": 3}})'),
        catalogue,
        'task',
      ),
    ).toBe('sum(sample_tests.passed, weights: {input: {"tests/7.in": 3}})');
  });

  it('reads an exec block’s program and language as plain text', () => {
    expect(tree('exec("programs/mean/", python, all)')).toEqual({
      block: 'exec',
      program: 'programs/mean/',
      language: 'python',
      over: { runs: 'all' },
    });
    expect(messages('exec("programs/mean.py", cobol, all)', task)).toEqual([
      'Give the folder of the task that holds the program and its program.yaml, such as programs/mean/.',
      "Give the program's language, one of c, cpp, java, python, ipynb.",
    ]);
  });

  it('prints no needless brackets, a minus as written, and a bound by name', () => {
    const lines = [
      'st1 - st2 - 1',
      'st1 - (st2 - 1)',
      'st1 / st2 * 2',
      'st1 * -st2',
      '-(st1 + st2)',
      '(st1 < st2) == 1',
      'entered(at_least: 0, at_most: 1)',
      'sum_best(k: 2, islands, gradebook.points)',
    ];
    for (const line of lines) {
      const scope = line.startsWith('sum_best') ? leaderboard : task;
      expect(printFormula(tree(line, scope), catalogue, scope.where)).toBe(line);
    }
  });

  it('keeps a parenthesised sum nested, and a bare chain flat', () => {
    const nested = tree('(40 + st1) + st2');
    const flat = tree('40 + st1 + st2');
    expect(nested).not.toEqual(flat);
    expect(printFormula(nested, catalogue, 'task')).toBe('(40 + st1) + st2');
  });

  it('says where a line cannot be read', () => {
    expect(parseFormula('st1 + "none')).toMatchObject({ ok: false, at: 6 });
    expect(parseFormula('st1 = 2')).toMatchObject({ ok: false, at: 4 });
  });

  it('prints a forge tree and reads it back', () => {
    const forge: Tree = {
      block: 'otherwise',
      of: [
        {
          run: [
            {
              block: 'first',
              from: { runs: 'all' },
              where: { block: 'eq', of: [{ run: ['all', 'passed'] }, '0'] },
            },
            'verdict',
          ],
        },
        { text: 'none' },
      ],
    };
    expect(tree(printFormula(forge, catalogue, 'task'))).toEqual(forge);
  });
});

describe('checkFormula', () => {
  it('reads a value of islands and a column of ICPC', () => {
    expect(messages('40 * st1 + 60 * st2', task)).toEqual([]);
    expect(
      messages('otherwise(first(all, all.passed == 0).verdict, "none")', task),
    ).toEqual([]);
    expect(messages('count(islands, islands.total == 0)', leaderboard)).toEqual([]);
  });

  it('reads max and min over a group or a task, not as max of numbers', () => {
    expect(messages('max(sample_tests, sample_tests.time_ms)', task)).toEqual([]);
    expect(messages('min(islands, islands.total)', leaderboard)).toEqual([]);
    expect(messages('max(st1, sample_tests)', task)).toEqual([
      'a group, not a number: count its runs, or fold one of its columns',
    ]);
  });

  it('reads on a leaderboard the values a task gives and the leaderboard facts, not its runs', () => {
    expect(messages('sum(islands, islands.total)', leaderboard)).toEqual([]);
    expect(messages('max(islands, islands.seconds_late)', leaderboard)).toEqual([]);
    expect(messages('sum(islands, islands.verdict)', leaderboard)).toEqual([
      'not a value of a submission',
    ]);
    expect(
      checkFormula(parsed('latest(islands).first_failed'), leaderboard, catalogue).kind,
    ).toBe('text');
  });

  it('reads a value that gives text as the forge does, through if, another value and a text column', () => {
    const kind = (line: string) =>
      checkFormula(parsed(line), leaderboard, catalogue).kind;
    expect(kind('latest(islands).medal')).toBe('text');
    expect(kind('latest(islands).badge')).toBe('text');
    expect(kind('latest(islands).first_name')).toBe('text');
    expect(kind('latest(tour).medal')).toBe('number');
    expect(messages('latest(islands).medal == "gold"', leaderboard)).toEqual([]);
  });

  it('names an unknown name and a per-run name outside a fold', () => {
    expect(messages('st1 + mystery + sample_tests.time_ms', task)).toEqual([
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
    expect(
      checkFormula(parsed('first(all, all.passed == 0).verdict'), task, catalogue).kind,
    ).toBe('text');
    expect(
      checkFormula(
        parsed('otherwise(first(all, all.passed == 0).verdict, "none")'),
        task,
        catalogue,
      ).kind,
    ).toBe('text');
    expect(messages('first_failed + 1', task)).toEqual(['text, and + takes a number']);
    expect(messages('st1 == "OK"', task)).toEqual(['compares text with a number']);
    expect(messages('otherwise("none", 1)', task)).toEqual([
      'Give two numbers or two texts, not one of each.',
    ]);
    expect(messages('best_each(islands, mystery, {total: desc})', leaderboard)).toEqual(
      ['not a name you can use here'],
    );
  });

  it('asks a task to read a column off a pick', () => {
    expect(messages('first(all)', task)).toEqual([
      'a pick gives a run, not a number or text: read one of its columns, such as .verdict',
    ]);
    expect(messages('last(all).colour', task)).toEqual(['not a column of a run']);
    expect(messages('st1.passed', task)).toEqual(['not a name you can use here']);
  });

  it('allows a pick as a leaderboard column or as the test of an if', () => {
    expect(messages('latest(islands)', leaderboard)).toEqual([]);
    expect(messages('if(latest(islands), 1, 0)', leaderboard)).toEqual([]);
    expect(messages('latest(islands) * 2', leaderboard)).toEqual([
      'a pick gives a submission, not a number or text: read one of its values, such as .total',
    ]);
  });

  it('refuses a name a formula cannot read', () => {
    expect(nameProblem('and')).toMatch(/operator/);
    expect(nameProblem('2sum')).toMatch(/starting with a letter/);
    expect(nameProblem('total')).toBeNull();
    expect(readLine('and', task, catalogue).unread?.message).toMatch(/cannot be read/);
  });

  it('marks the span a forge path names', () => {
    expect(spanOf(parsed('first_failed + 1'), ['of', 0], catalogue, 'task')).toEqual({
      from: 0,
      to: 'first_failed'.length,
    });
    expect(
      spanOf(parsed('sum(sample_tests.passed)'), ['of'], catalogue, 'task')?.from,
    ).toBe('sum('.length);
  });
});

describe('the line', () => {
  it('colours names, blocks, columns and text', () => {
    const pieces = piecesOf('first(all).verdict == "OK" and fir', task, catalogue)
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

  it('wants a group inside count, and a column after a pick', () => {
    expect(contextAt('count(sa', 8, task, catalogue)).toMatchObject({
      typed: 'sa',
      want: 'set',
      each: false,
    });
    expect(contextAt('first(all).ve', 13, task, catalogue)).toMatchObject({
      want: 'field',
    });
    expect(contextAt('sum(if(st1 > 0, 1, 0) + ', 24, task, catalogue)).toMatchObject({
      each: true,
    });
  });

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

  it('lists what a formula reads, not the column read off a pick', () => {
    expect(
      namesIn(parsed('otherwise(first(all, all.passed == 0).verdict, "none") == st1')),
    ).toEqual(['all', 'all.passed', 'st1']);
  });

  it('refuses a tree past the limit, and a leaderboard past 100 columns', () => {
    const wide: Tree = {
      block: 'add',
      of: Array.from({ length: NODE_LIMIT }, () => '1'),
    };
    expect(limitProblem(wide)).toMatch(/1,000|1000/);
    expect(columnProblem(101)).toMatch(/100/);
    expect(columnProblem(100)).toBeNull();
  });
});
