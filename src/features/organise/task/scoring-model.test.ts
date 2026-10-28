import {
  runsOf,
  submissionRuns,
  runName,
  ticksOf,
  withTick,
  inGroup,
  outputColumns,
  type ScoreGroup,
} from './scoring-model';
import { emptyTuple, type AxisValues } from '../forms/task-values';
import { describe, expect, it } from 'vitest';
import { specCatalogue } from '../formula/catalogue';
import { readLine, type FormulaScope } from '../formula/parse';
import type { DeclaredInput } from '@/api/types';
import { readTask, writeTask } from '../forms/task-values';
import { exactAt, parseYaml, writeYaml, type Doc } from '../forms/yaml-doc';
import {
  axisColumns,
  checkProblem,
  columnsOf,
  printed,
  readScoring,
  renamed,
  scopeOf,
  valueTree,
  withLine,
  writeScoring,
} from './scoring-model';

const catalogue = specCatalogue();

const scope: FormulaScope = {
  where: 'task',
  names: ['spread', 'weighted', 'by_file'],
  each: ['all.passed', 'all.verdict'],
  sets: ['all'],
  texts: ['all.verdict'],
  fields: { passed: 'number', verdict: 'text' },
};

/**
 * An `exec` value and the forge's two shapes of weights (forge
 * domain/blocks/check.py `_weights`): a repeated input's values as they
 * were given, a path and a number.
 */
const TASK = `name: Mean
scoring:
  values:
    spread: {block: exec, program: programs/mean/, language: python, over: {runs: all}}
    weighted: {block: count, over: {runs: all}, weights: {seed: {1: 2}}}
    by_file: {block: sum, over: {runs: all}, of: {run: [all, passed]}, weights: {input: {tests/7.in: 3}}}
`;

function open(text: string): Doc {
  const parsed = parseYaml(text);
  if ('error' in parsed) throw new Error(parsed.error);
  return parsed.doc;
}

describe('an exec value and weights', () => {
  it('print as lines a formula reads back to the same trees', () => {
    const doc = open(TASK);
    const read = readScoring((path) => exactAt(doc, path));
    const lines = read.scoreValues.map((value) => printed(value, catalogue));
    expect(lines).toEqual([
      'exec("programs/mean/", python, all)',
      'count(all, weights: {seed: {1: 2}})',
      'sum(all.passed, weights: {input: {"tests/7.in": 3}})',
    ]);
    for (const value of read.scoreValues) {
      const reading = valueTree(
        { ...value, text: printed(value, catalogue) },
        scope,
        catalogue,
      );
      expect(reading).toEqual(value.tree);
    }
  });

  it('write back each weighed value as the type the runs were given', () => {
    const doc = open(TASK);
    const before = readScoring((path) => exactAt(doc, path));
    const after = {
      ...before,
      scoreValues: before.scoreValues.map((value) => ({
        ...value,
        text: printed(value, catalogue).replace('{1: 2}', '{1: 4}'),
      })),
    };
    writeScoring(doc, before, after, (value) => valueTree(value, scope, catalogue));
    const text = writeYaml(doc);
    expect(text).toContain('weights: {seed: {1: 4}}');
    expect(text).toContain('weights: {input: {tests/7.in: 3}}');
    expect(text).toContain('program: programs/mean/');
    expect(text).toContain('language: python');
  });
});

const CHECKED_TASK = `name: Sum
workflow: unicon/checked@v1
inputs:
  code: {entrant: {label: Solution}}
  n: {entrant: {label: N}}
  strict: {entrant: {label: Strict}}
  mode: {entrant: {label: Mode}}
checks:
  - submit: {code: solutions/ok.py, n: 5, strict: true, mode: "7"}
    expect: {verdict: accepted}
`;

function declared(id: string, type: string): DeclaredInput {
  return {
    id,
    type,
    options: null,
    optional: false,
    title: null,
    help: null,
    unit: null,
  };
}

describe('a check', () => {
  it('writes each input it gives as the type the input declares', () => {
    const doc = open(CHECKED_TASK);
    const { values, unreadable } = readTask(doc, [
      declared('code', 'file'),
      declared('n', 'number'),
      declared('strict', 'boolean'),
      declared('mode', 'text'),
    ]);
    const [check] = values.checks;
    if (check === undefined) throw new Error('no check');
    writeTask(
      doc,
      values,
      {
        ...values,
        checks: [{ ...check, submit: { ...check.submit, n: '6', strict: 'false' } }],
      },
      { admin: false, unreadable },
    );
    const text = writeYaml(doc);
    expect(text).toContain('code: solutions/ok.py\n');
    expect(text).toContain('n: 6\n');
    expect(text).toContain('strict: false\n');
    expect(text).toContain('mode: "7"\n');
  });

  it('needs the verdict or a value it should get', () => {
    const empty = { key: 'c', submit: {}, verdict: '', values: [] };
    expect(checkProblem(empty, 0)).toBe(
      'Check 1 needs the verdict or a value it should get.',
    );
    expect(checkProblem({ ...empty, verdict: 'output_limit' }, 0)).toBeUndefined();
    expect(
      checkProblem({ ...empty, values: [{ name: 'total', expected: '3' }] }, 0),
    ).toBeUndefined();
  });
});

describe('a value’s line', () => {
  it('empties, rather than springing back to the formula read', () => {
    const doc = open(TASK);
    const [spread] = readScoring((path) => exactAt(doc, path)).scoreValues;
    if (spread === undefined) throw new Error('no value');
    const emptied = withLine(spread, '', scope, catalogue);
    expect(emptied.tree).toBeNull();
    expect(printed(emptied, catalogue)).toBe('');
    expect(
      readLine(printed(emptied, catalogue), scope, catalogue).unread?.message,
    ).toBe('Write a formula.');
  });
});

describe('renaming a value', () => {
  it('renames only where a formula reads the value, not a column or a text of that name', () => {
    const named: FormulaScope = {
      ...scope,
      names: ['score', 'total'],
      each: [...scope.each, 'all.score'],
      fields: { ...scope.fields, score: 'number' },
    };
    const line =
      'score + sum(all.score) + first(all).score + if(otherwise(1, 0), 1, 0)';
    const text = `${line} + count(all, all.verdict == "score")`;
    const total = withLine(
      { key: 't', name: 'total', text: '', tree: null, saved: 'never' },
      text,
      named,
      catalogue,
    );
    const next = renamed(
      [{ key: 's', name: 'points', text: '', tree: '1', saved: 'never' }, total],
      'score',
      'points',
      catalogue,
    );
    expect(next?.[1]?.text).toBe(
      'points + sum(all.score) + first(all).score + if(otherwise(1, 0), 1, 0) + ' +
        'count(all, all.verdict == "score")',
    );
  });
});

describe('a scoring write', () => {
  it('renames a value where it stands, keeps comments, and writes no empty show list', () => {
    const text = [
      'name: Mean',
      'scoring:',
      '  values:',
      '    # the main score',
      '    score: 1 # one point',
      '    extra: 2',
      '  show:',
      '    now: [score]',
      '',
    ].join('\n');
    const doc = open(text);
    const before = readScoring((path) => exactAt(doc, path));
    const after = {
      ...before,
      scoreValues: before.scoreValues.map((value) =>
        value.name === 'score' ? { ...value, name: 'points' } : value,
      ),
      show: { points: 'now' as const },
    };
    writeScoring(doc, before, after, (value) => value.tree);
    expect(writeYaml(doc)).toBe(
      [
        'name: Mean',
        'scoring:',
        '  values:',
        '    # the main score',
        '    points: 1 # one point',
        '    extra: 2',
        '  show:',
        '    now: [points]',
        '',
      ].join('\n'),
    );
  });

  it('renames a chain of values, a to b and b to c where c is removed, each where it stands', () => {
    const text = [
      'name: Mean',
      'scoring:',
      '  values:',
      '    a: 1 # first',
      '    b: 2',
      '    c: 3',
      '',
    ].join('\n');
    const doc = open(text);
    const before = readScoring((path) => exactAt(doc, path));
    const names: Record<string, string> = { a: 'b', b: 'c' };
    const after = {
      ...before,
      scoreValues: [
        ...before.scoreValues
          .filter((value) => value.name !== 'c')
          .map((value) => ({ ...value, name: names[value.name] ?? value.name })),
      ],
    };
    writeScoring(doc, before, after, (value) => value.tree);
    expect(writeYaml(doc)).toBe(
      ['name: Mean', 'scoring:', '  values:', '    b: 1 # first', '    c: 2', ''].join(
        '\n',
      ),
    );
  });
});

describe('the columns of a run', () => {
  it('hold each input an axis fills, a number input a number and a text input text', () => {
    const columns = columnsOf([]).concat(
      axisColumns(
        [{ inputs: ['seed', 'name'] }, { inputs: ['code'] }],
        [
          { id: 'seed', type: 'number' },
          { id: 'name', type: 'text' },
          { id: 'code', type: 'file' },
        ],
      ),
    );
    const values = [
      { key: 'v', name: 'top', text: '', tree: null, saved: 'never' as const },
    ];
    const read = (line: string) =>
      readLine(line, scopeOf([], values, columns, catalogue), catalogue);
    expect(read('max(all.seed)').problems).toEqual([]);
    const name = read('otherwise(first(all, all.verdict != "accepted").name, "none")');
    expect(name.problems).toEqual([]);
    expect(name.kind).toBe('text');
    expect(read('max(all.code)').problems).not.toEqual([]);
  });
});

const TYPED_TASK = `name: Typed
workflow: unicon/checked@v1
inputs:
  code: {entrant: {label: Solution}}
repeat:
  - inputs: [seed, name]
    tuples:
      - {seed: 1, name: "1"}
      - {seed: 2, name: x}
scoring:
  groups:
    small: {seed: 1}
    two: {seed: [1, 2]}
    named: {name: "1"}
  values:
    total: {block: sum, over: {runs: all}, of: {run: [all, passed]}, weights: {name: {"1": 2}}}
    tries: {block: count, over: {runs: all}, weights: {seed: {1: 2}}}
    medal: {block: if, test: {value: total}, then: {text: "1"}, else: {text: "0"}}
    other: 1
checks:
  - submit: {code: ok.py}
    expect: {total: 3, medal: "1"}
`;

describe('a write of picks, weights and what a check expects', () => {
  it('writes each as the type its input declares, or its value gives', () => {
    const doc = open(TYPED_TASK);
    const { values, unreadable } = readTask(doc, [
      declared('code', 'file'),
      declared('seed', 'number'),
      declared('name', 'text'),
    ]);
    const [check] = values.checks;
    if (check === undefined) throw new Error('no check');
    writeTask(
      doc,
      values,
      {
        ...values,
        scoreValues: values.scoreValues.map((value) =>
          value.name === 'other' ? { ...value, tree: '2' } : value,
        ),
        checks: [
          {
            ...check,
            values: [
              { name: 'total', expected: '4' },
              { name: 'medal', expected: '0' },
            ],
          },
        ],
      },
      { admin: false, unreadable, catalogue },
    );
    const text = writeYaml(doc);
    expect(text).toContain('small: {seed: 1}');
    expect(text).toContain('two: {seed: [1, 2]}');
    expect(text).toContain('named: {name: "1"}');
    expect(text).toContain('weights: {name: {"1": 2}}');
    expect(text).toContain('weights: {seed: {1: 2}}');
    expect(text).toContain('other: 2');
    expect(text).toMatch(/expect:\n {6}total: 4\n {6}medal: "0"\n/);
  });
});

describe('group ticks on tables', () => {
  const table = (input: string, values: string[]): AxisValues => ({
    inputs: [input],
    tuples: values.map((value) => ({
      ...emptyTuple([input]),
      cells: { [input]: { entrant: false, value } },
    })),
  });
  const tables = [
    table('input', ['small/1.in', 'small/2.in']),
    table('seed', ['1', '2', '3']),
  ];
  const none: ScoreGroup = {
    key: 'g',
    name: 'small',
    picks: {},
    none: true,
    saved: 'never',
  };
  it('makes the one run every submission makes while no input repeats', () => {
    expect(submissionRuns([])).toEqual([{ id: '0', title: 'The one run', cells: {} }]);
    expect(submissionRuns([{ inputs: [], tuples: [emptyTuple([])] }])).toHaveLength(1);
    expect(submissionRuns(tables)).toEqual(runsOf(tables));
  });
  it('names a run from its files and values unless titled', () => {
    const rows = runsOf(tables);
    expect(runName(rows[0]!, tables)).toBe('small/1.in, 1');
    expect(runName({ ...rows[0]!, title: 'Sample' }, tables)).toBe('Sample');
  });
  it('ignores the old value retained behind an entrant cell when a group is ticked', () => {
    const axis: AxisValues = {
      inputs: ['input', 'route'],
      tuples: [
        {
          ...emptyTuple(['input', 'route']),
          cells: {
            input: { entrant: false, value: 'a.in' },
            route: { entrant: true, value: 'old-route.txt' },
          },
        },
        {
          ...emptyTuple(['input', 'route']),
          cells: {
            input: { entrant: false, value: 'b.in' },
            route: { entrant: true, value: '' },
          },
        },
      ],
    };
    const runs = runsOf([axis]);
    const picked = withTick(none, axis, 0, true, runs);
    expect(picked.none).toBe(false);
    expect(picked.picks).toEqual({ input: ['a.in'] });
    expect(ticksOf(picked, [axis])).toEqual([[true, false]]);
    expect(runs.filter((run) => inGroup(run, picked)).map((run) => run.id)).toEqual([
      '0',
    ]);
  });

  it('picks one seed across every row of the first table', () => {
    const runs = runsOf(tables);
    const picked = withTick(none, tables[1]!, 0, true, runs);
    expect(runs.filter((run) => inGroup(run, picked)).map((run) => run.cells)).toEqual([
      { input: 'small/1.in', seed: '1' },
      { input: 'small/2.in', seed: '1' },
    ]);
    expect(ticksOf(picked, tables)).toEqual([
      [true, true],
      [true, false, false],
    ]);
  });
  it('keeps a named all-runs group explicit for the saved format', () => {
    const runs = runsOf([tables[0]!]);
    const one = withTick(none, tables[0]!, 0, true, runs);
    const all = withTick(one, tables[0]!, 1, true, runs);
    expect(all.picks).toEqual({ input: ['small/1.in', 'small/2.in'] });
    expect(all.none).toBe(false);
    expect(ticksOf(all, [tables[0]!])).toEqual([[true, true]]);
  });
  it('keeps an empty table empty while another table’s selection is remembered', () => {
    const runs = runsOf(tables);
    const seed = withTick(none, tables[1]!, 0, true, runs);
    const first = withTick(seed, tables[0]!, 1, false, runs);
    const empty = withTick(first, tables[0]!, 0, false, runs);
    expect(runs.filter((run) => inGroup(run, empty))).toEqual([]);
    expect(ticksOf(empty, tables)).toEqual([
      [false, false],
      [true, false, false],
    ]);
    expect(withTick(empty, tables[0]!, 0, true, runs).picks).toEqual({
      input: ['small/1.in'],
      seed: ['1'],
    });
  });
  it('uses the workflow’s text-values list for text outputs', () => {
    expect(
      outputColumns(
        { outputs: { log: { title: 'Compile log' }, time: { unit: 'ms' } } },
        ['log'],
      ).map((column) => column.kind),
    ).toEqual(['text', 'number']);
  });
});

it('keeps equal input values together when the file cannot distinguish rows', () => {
  const table: AxisValues = {
    inputs: ['input', 'answer'],
    tuples: [
      {
        ...emptyTuple(['input', 'answer']),
        cells: {
          input: { entrant: false, value: '1' },
          answer: { entrant: false, value: 'a' },
        },
      },
      {
        ...emptyTuple(['input', 'answer']),
        cells: {
          input: { entrant: false, value: '2' },
          answer: { entrant: false, value: 'b' },
        },
      },
      {
        ...emptyTuple(['input', 'answer']),
        cells: {
          input: { entrant: false, value: '1' },
          answer: { entrant: false, value: 'b' },
        },
      },
    ],
  };
  const runs = runsOf([table]);
  const first = withTick(
    { key: 'g', name: 'g', picks: {}, none: true, saved: 'never' },
    table,
    0,
    true,
    runs,
  );
  const next = withTick(first, table, 1, true, runs);
  expect(ticksOf(next, [table])).toEqual([[true, true, true]]);
  expect(next.none).toBe(false);
  expect(ticksOf(withTick(next, table, 2, false, runs), [table])[0]?.[2]).toBe(false);
});
