import {
  draftRunRows,
  runName,
  ticksOf,
  withTick,
  inGroup,
  outputColumns,
  type ScoreGroup,
} from './scoring-model';
import type { DraftRun } from '@/api/types';
import { emptyTuple, type AxisValues } from '../forms/task-values';
import { describe, expect, it } from 'vitest';
import { specCatalogue } from '@/test/catalogue';
import { readLine, type FormulaScope } from '../formula/parse';
import { readTask, writeTask } from '../forms/task-values';
import type { Values } from '../forms/values';
import { declared, taskFileOf, taskValuesOf } from '@/test/task-values';
import {
  axisColumns,
  columnsOf,
  printed,
  emptyShow,
  hidesAlways,
  momentsOf,
  readScoring,
  renamed,
  renamedInShow,
  runMoments,
  scopeOf,
  showSpot,
  showTroublesOf,
  troublesOf,
  valueTree,
  withLine,
  withMoment,
  withRunMoment,
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

function open(text: string): Values {
  const values = taskValuesOf(text);
  if (values === null) throw new Error('not settings');
  return values;
}

describe('an exec value and weights', () => {
  it('print as lines a formula reads back to the same trees', () => {
    const doc = open(TASK);
    const read = readScoring(doc);
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
    const before = readScoring(doc);
    const after = {
      ...before,
      scoreValues: before.scoreValues.map((value) => ({
        ...value,
        text: printed(value, catalogue).replace('{1: 2}', '{1: 4}'),
      })),
    };
    writeScoring(doc, before, after, (value) => valueTree(value, scope, catalogue));
    // A weight's key is text; the forge gives it the type of the value it names.
    expect(taskFileOf(doc)['scoring']).toMatchObject({
      values: {
        spread: { program: 'programs/mean/', language: 'python' },
        weighted: { weights: { seed: { '1': 4 } } },
        by_file: { weights: { input: { 'tests/7.in': 3 } } },
      },
    });
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
    expect(doc['checks']).toEqual([
      {
        submit: { code: 'solutions/ok.py', n: 6, strict: false, mode: '7' },
        expect: { verdict: 'accepted' },
      },
    ]);
  });
});

describe('a value’s line', () => {
  it('empties, rather than springing back to the formula read', () => {
    const doc = open(TASK);
    const [spread] = readScoring(doc).scoreValues;
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
      { key: 't', name: 'total', text: '', tree: null },
      text,
      named,
      catalogue,
    );
    const next = renamed(
      [{ key: 's', name: 'points', text: '', tree: '1' }, total],
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

const SHOWN = [
  'name: Mean',
  'scoring:',
  '  groups:',
  '    sample: {input: sample.in}',
  '  values:',
  '    points: 1',
  '    bonus: 2',
  '  show:',
  '    always:',
  '      values: [points]',
  '      inputs: [time_limit, memory_limit]',
  '      outputs: [log]',
  '      runs:',
  '        - {of: sample, fields: [input, answer, verdict, score, time_ms]}',
  '        - {of: first_not_passed, fields: [verdict]}',
  '    after_deadline:',
  '      values: [bonus]',
  '      runs:',
  '        - {of: all, fields: [input, answer, verdict, score]}',
  '    after_release:',
  '      values: [bonus]',
  '',
].join('\n');

describe('a show', () => {
  it('leaves scoring as written when its show is not in the shape the grid reads', () => {
    for (const show of [
      '  show:\n    always: {values: points}\n',
      '  show:\n    now: [points]\n',
      '  show:\n    always:\n      runs: [{of: sample, fields: verdict}]\n',
      '  show:\n    always:\n      runs: [{of: sample, fields: [verdict], when: x}]\n',
      '  show: [points]\n',
    ]) {
      const text = `name: Sum\nscoring:\n  values: {points: 1}\n${show}`;
      const doc = open(text);
      const read = structuredClone(doc);
      const before = readScoring(doc);
      expect(before.unreadable).toContain('scoring');
      const after = {
        ...before,
        scoreValues: before.scoreValues.map((value) => ({ ...value, tree: '2' })),
      };
      writeScoring(doc, before, after, (value) => value.tree);
      expect(doc).toEqual(read);
    }
  });

  it('reads a show in the shape, or none, as readable', () => {
    for (const show of ['', '  show:\n    always:\n      values: [points]\n']) {
      const doc = open(`name: Sum\nscoring:\n  values: {points: 1}\n${show}`);
      expect(readScoring(doc).unreadable).toEqual([]);
    }
  });

  it('round-trips unchanged: a switch turned on and off again writes nothing', () => {
    const doc = open(SHOWN);
    const before = readScoring(doc);
    const toggled = withMoment(
      withMoment(before.show, 'values', 'bonus', 'always', true),
      'values',
      'bonus',
      'always',
      false,
    );
    const back = withMoment(
      withMoment(toggled, 'values', 'bonus', 'after_deadline', true),
      'values',
      'bonus',
      'after_release',
      true,
    );
    expect(back).toEqual(before.show);
    writeScoring(doc, before, { ...before, show: back }, (value) => value.tree);
    expect(doc).toEqual(open(SHOWN));
  });

  it('writes each moment as it read it when the rest of scoring changes', () => {
    const doc = open(SHOWN);
    const before = readScoring(doc);
    const after = {
      ...before,
      scoreValues: before.scoreValues.map((value) =>
        value.name === 'bonus' ? { ...value, tree: '3' } : value,
      ),
    };
    writeScoring(doc, before, after, (value) => value.tree);
    expect(taskFileOf(doc)['scoring']).toMatchObject({
      values: { points: 1, bonus: 3 },
      show: (taskFileOf(open(SHOWN))['scoring'] as { show: unknown }).show,
    });
  });

  it('leaves out an empty moment, list and run entry, and show itself when nothing is shown', () => {
    const doc = open(SHOWN);
    const before = readScoring(doc);
    let show = before.show;
    for (const [moment, name] of [
      ['always', 'points'],
      ['after_deadline', 'bonus'],
      ['after_release', 'bonus'],
    ] as const) {
      show = withMoment(show, 'values', name, moment, false);
    }
    for (const name of ['time_limit', 'memory_limit'])
      show = withMoment(show, 'inputs', name, 'always', false);
    show = withMoment(show, 'outputs', 'log', 'always', false);
    for (const [of, fields, moment] of [
      ['sample', ['input', 'answer', 'verdict', 'score', 'time_ms'], 'always'],
      ['first_not_passed', ['verdict'], 'always'],
      ['all', ['input', 'answer', 'verdict', 'score'], 'after_deadline'],
    ] as const) {
      for (const field of fields) show = withRunMoment(show, of, field, moment, false);
    }
    expect(show).toEqual(emptyShow());
    writeScoring(doc, before, { ...before, show }, (value) => value.tree);
    expect(doc['scoring']).not.toHaveProperty('show');
  });

  it('turns both later moments on with Always, which they never do to each other', () => {
    let show = emptyShow();
    show = withMoment(show, 'values', 'score', 'after_deadline', true);
    expect(momentsOf(show, 'values', 'score')).toEqual(['after_deadline']);
    show = withMoment(show, 'values', 'score', 'after_release', true);
    // Both later ones on write the name under both.
    expect(show.after_deadline.values).toEqual(['score']);
    expect(show.after_release.values).toEqual(['score']);
    show = withMoment(show, 'values', 'score', 'after_deadline', false);
    expect(momentsOf(show, 'values', 'score')).toEqual(['after_release']);

    show = withMoment(show, 'values', 'score', 'always', true);
    // Always shows it then already, so the later moments do not list it again.
    expect(momentsOf(show, 'values', 'score')).toEqual(['always']);
    expect(withMoment(show, 'values', 'score', 'after_deadline', true)).toBe(show);
    expect(withMoment(show, 'values', 'score', 'always', false)).toEqual(emptyShow());
  });

  it('turns a run field on and off as a name, its entry going with its last field', () => {
    let show = emptyShow();
    show = withRunMoment(show, 'sample', 'verdict', 'after_deadline', true);
    show = withRunMoment(show, 'sample', 'score', 'after_release', true);
    show = withRunMoment(show, 'sample', 'score', 'after_deadline', true);
    expect(show.after_deadline.runs).toEqual([
      { of: 'sample', fields: ['verdict', 'score'] },
    ]);
    expect(runMoments(show, 'sample', 'score')).toEqual([
      'after_deadline',
      'after_release',
    ]);
    show = withRunMoment(show, 'sample', 'score', 'always', true);
    expect(runMoments(show, 'sample', 'score')).toEqual(['always']);
    expect(show.after_release.runs).toEqual([]);
    expect(show.after_deadline.runs).toEqual([{ of: 'sample', fields: ['verdict'] }]);
    show = withRunMoment(show, 'sample', 'verdict', 'after_deadline', false);
    expect(show.after_deadline.runs).toEqual([]);
  });

  it('calls it hiding only when a part shown always stops reaching what it reached', () => {
    const rows = ['sample.in', 'big.in'].map((input, index) => ({
      id: String(index),
      title: input,
      cells: { input },
    }));
    const sample: ScoreGroup = {
      key: 'g',
      name: 'sample',
      picks: { input: ['sample.in'] },
      none: false,
    };
    const saved = withRunMoment(
      withMoment(emptyShow(), 'values', 'score', 'always', true),
      'sample',
      'score',
      'always',
      true,
    );
    const field = {
      kind: 'runs' as const,
      field: 'score',
      runs: rows,
      groups: [sample],
    };
    expect(hidesAlways(saved, emptyShow(), { kind: 'values', name: 'score' })).toBe(
      true,
    );
    expect(
      hidesAlways(saved, withMoment(saved, 'values', 'score', 'after_deadline', true), {
        kind: 'values',
        name: 'score',
      }),
    ).toBe(false);
    // Moving a field from sample to all reaches every run sample did.
    const moved = withRunMoment(
      withRunMoment(saved, 'sample', 'score', 'always', false),
      'all',
      'score',
      'always',
      true,
    );
    expect(hidesAlways(saved, moved, { ...field, of: 'sample' })).toBe(false);
    const savedAll = withRunMoment(emptyShow(), 'all', 'score', 'always', true);
    const narrowed = withRunMoment(emptyShow(), 'sample', 'score', 'always', true);
    expect(hidesAlways(savedAll, narrowed, { ...field, of: 'all' })).toBe(true);
    const failing = withRunMoment(
      emptyShow(),
      'first_not_passed',
      'score',
      'always',
      true,
    );
    expect(
      hidesAlways(failing, emptyShow(), { ...field, of: 'first_not_passed' }),
    ).toBe(true);
    expect(hidesAlways(failing, failing, { ...field, of: 'first_not_passed' })).toBe(
      false,
    );
  });
});

describe('a scoring write', () => {
  it('renames a value where it stands, and renames it in show', () => {
    const doc = open(
      [
        'name: Mean',
        'scoring:',
        '  values:',
        '    score: 1',
        '    extra: 2',
        '  show:',
        '    always:',
        '      values: [score]',
        '',
      ].join('\n'),
    );
    const before = readScoring(doc);
    const after = {
      ...before,
      scoreValues: before.scoreValues.map((value) =>
        value.name === 'score' ? { ...value, name: 'points' } : value,
      ),
      show: renamedInShow(before.show, 'values', 'score', 'points'),
    };
    writeScoring(doc, before, after, (value) => value.tree);
    expect(doc['scoring']).toEqual({
      values: [
        { name: 'points', formula: 1 },
        { name: 'extra', formula: 2 },
      ],
      show: { always: { values: ['points'] } },
    });
  });

  it('renames a chain of values, a to b and b to c where c is removed, each where it stands', () => {
    const doc = open(
      [
        'name: Mean',
        'scoring:',
        '  values:',
        '    a: 1',
        '    b: 2',
        '    c: 3',
        '',
      ].join('\n'),
    );
    const before = readScoring(doc);
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
    expect(doc['scoring']).toEqual({
      values: [
        { name: 'b', formula: 1 },
        { name: 'c', formula: 2 },
      ],
    });
  });

  it('sends a group or value with no name, two values with one name and a group that picks nothing, for the forge to refuse', () => {
    const doc = open(
      ['name: Mean', 'scoring:', '  values:', '    a: 1', ''].join('\n'),
    );
    const before = readScoring(doc);
    const groups: ScoreGroup[] = [
      { key: 'g1', name: '', picks: { seed: ['1'] }, none: false },
      { key: 'g2', name: 'empty', picks: {}, none: true },
    ];
    const after = {
      ...before,
      scoreGroups: groups,
      scoreValues: [
        ...before.scoreValues,
        { key: 'v1', name: 'a', text: '', tree: '2' },
        { key: 'v2', name: '', text: '', tree: '3' },
      ],
    };
    writeScoring(doc, before, after, (value) => value.tree);
    expect(doc['scoring']).toEqual({
      groups: [
        { name: '', picks: { seed: 1 } },
        { name: 'empty', picks: {} },
      ],
      values: [
        { name: 'a', formula: 1 },
        { name: 'a', formula: 2 },
        { name: '', formula: 3 },
      ],
    });
  });
});

describe('what the forge said of a group or a value', () => {
  it('stands by the group or value it names, a value’s formula problems marked on the formula instead', () => {
    const groups: ScoreGroup[] = [{ key: 'g1', name: '', picks: {}, none: true }];
    const values = [
      { key: 'v1', name: 'a', text: '', tree: '1' },
      { key: 'v2', name: 'b', text: '', tree: '1' },
    ];
    const troubles = troublesOf(groups, values, [
      { path: ['scoring', 'groups', ''], message: 'Give the group a name.' },
      { path: ['scoring', 'values', 'a'], message: 'a is listed twice.' },
      { path: ['scoring', 'values', 'b', 'of'], message: 'Not a number.' },
    ]);
    expect([...troubles]).toEqual([
      ['g1', 'Give the group a name.'],
      ['v1', 'a is listed twice.'],
    ]);
  });

  it('stands by the row of show it names, counted in show as the file writes it', () => {
    const show = emptyShow();
    show.always.inputs = ['token'];
    show.after_release.runs = [
      { of: 'samples', fields: [] },
      { of: 'all', fields: ['verdict', 'log'] },
    ];
    const troubles = showTroublesOf(show, [
      { path: ['scoring', 'show', 'always', 'inputs', 0], message: 'A secret.' },
      {
        path: ['scoring', 'show', 'after_release', 'runs', 0, 'fields', 1],
        message: 'A file.',
      },
      { path: ['scoring', 'show', 'after_release', 'runs', 0, 'of'], message: 'Of.' },
      { path: ['scoring', 'show', 'always', 'outputs', 3], message: 'No such row.' },
    ]);
    expect([...troubles]).toEqual([
      [showSpot('inputs', 'token'), 'A secret.'],
      [showSpot('runs', 'all', 'log'), 'A file.'],
      [showSpot('runs', 'all'), 'Of.'],
    ]);
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
    const values = [{ key: 'v', name: 'top', text: '', tree: null }];
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
  it('writes each as the type its input declares, or its value gives, a weight’s key as text', () => {
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
    const file = taskFileOf(doc);
    expect(file['scoring']).toMatchObject({
      groups: { small: { seed: 1 }, two: { seed: [1, 2] }, named: { name: '1' } },
      values: {
        total: { weights: { name: { '1': 2 } } },
        tries: { weights: { seed: { '1': 2 } } },
        other: 2,
      },
    });
    expect(file['checks']).toEqual([
      { submit: { code: 'ok.py' }, expect: { total: 4, medal: '0' } },
    ]);
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
  const run = (cells: Record<string, unknown>, titles: string[] = []): DraftRun => ({
    titles,
    cells,
  });
  const tables = [
    table('input', ['small/1.in', 'small/2.in']),
    table('seed', ['1', '2', '3']),
  ];
  // The server's answer for `tables`, a seed being a number.
  const drafted = draftRunRows(
    {
      runs: ['small/1.in', 'small/2.in'].flatMap((input) =>
        [1, 2, 3].map((seed) => run({ input, seed })),
      ),
      count: 6,
      axes: [
        [run({ input: 'small/1.in' }), run({ input: 'small/2.in' })],
        [run({ seed: 1 }), run({ seed: 2 }), run({ seed: 3 })],
      ],
    },
    tables,
  );
  const axisAt = (index: number) => ({
    inputs: tables[index]!.inputs,
    rows: drafted.axes[index]!,
  });
  const none: ScoreGroup = {
    key: 'g',
    name: 'small',
    picks: {},
    none: true,
  };
  it('calls the one run every submission makes while no input repeats', () => {
    const one = draftRunRows({ runs: [run({})], count: 1, axes: [] }, []);
    expect(one.runs).toEqual([{ id: '0', title: 'The one run', cells: {} }]);
  });
  it('names a run from its files and values unless titled, its cells as text', () => {
    expect(drafted.runs[0]).toEqual({
      id: '0',
      title: 'small/1.in, 1',
      cells: { input: 'small/1.in', seed: '1' },
    });
    const titled = draftRunRows(
      { runs: [run({ seed: 1 }, ['Sample'])], count: 1, axes: [[run({ seed: 1 })]] },
      [tables[1]!],
    );
    expect(titled.runs[0]?.title).toBe('Sample');
    expect(runName({ ...drafted.runs[0]!, title: 'Sample' }, tables)).toBe('Sample');
  });
  it('ticks only by the cells the server gives, an entrant cell left out', () => {
    const axis = { inputs: ['input', 'route'], rows: [] };
    const answer = draftRunRows(
      {
        runs: [run({ input: 'a.in' }), run({ input: 'b.in' })],
        count: 2,
        axes: [[run({ input: 'a.in' }), run({ input: 'b.in' })]],
      },
      [{ inputs: axis.inputs, tuples: [] }],
    );
    const runs = answer.runs;
    const ticked = { ...axis, rows: answer.axes[0]! };
    const picked = withTick(none, ticked, 0, true, runs);
    expect(picked.none).toBe(false);
    expect(picked.picks).toEqual({ input: ['a.in'] });
    expect(ticksOf(picked, ticked)).toEqual([true, false]);
    expect(runs.filter((run) => inGroup(run, picked)).map((run) => run.id)).toEqual([
      '0',
    ]);
  });

  it('picks one seed across every row of the first table', () => {
    const runs = drafted.runs;
    const picked = withTick(none, axisAt(1), 0, true, runs);
    expect(runs.filter((run) => inGroup(run, picked)).map((run) => run.cells)).toEqual([
      { input: 'small/1.in', seed: '1' },
      { input: 'small/2.in', seed: '1' },
    ]);
    expect(ticksOf(picked, axisAt(0))).toEqual([true, true]);
    expect(ticksOf(picked, axisAt(1))).toEqual([true, false, false]);
  });
  it('keeps a named all-runs group explicit for the saved format', () => {
    const runs = drafted.axes[0]!;
    const one = withTick(none, axisAt(0), 0, true, runs);
    const all = withTick(one, axisAt(0), 1, true, runs);
    expect(all.picks).toEqual({ input: ['small/1.in', 'small/2.in'] });
    expect(all.none).toBe(false);
    expect(ticksOf(all, axisAt(0))).toEqual([true, true]);
  });
  it('keeps an empty table empty while another table’s selection is remembered', () => {
    const runs = drafted.runs;
    const seed = withTick(none, axisAt(1), 0, true, runs);
    const first = withTick(seed, axisAt(0), 1, false, runs);
    const empty = withTick(first, axisAt(0), 0, false, runs);
    expect(runs.filter((run) => inGroup(run, empty))).toEqual([]);
    expect(ticksOf(empty, axisAt(0))).toEqual([false, false]);
    expect(ticksOf(empty, axisAt(1))).toEqual([true, false, false]);
    expect(withTick(empty, axisAt(0), 0, true, runs).picks).toEqual({
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
  const cells = [
    { input: 1, answer: 'a' },
    { input: 2, answer: 'b' },
    { input: 1, answer: 'b' },
  ];
  const tuples = cells.map((cell) => ({ titles: [], cells: cell }));
  const table: AxisValues = { inputs: ['input', 'answer'], tuples: [] };
  const answer = draftRunRows({ runs: tuples, count: 3, axes: [tuples] }, [table]);
  const runs = answer.runs;
  const axis = { inputs: table.inputs, rows: answer.axes[0]! };
  const first = withTick(
    { key: 'g', name: 'g', picks: {}, none: true },
    axis,
    0,
    true,
    runs,
  );
  const next = withTick(first, axis, 1, true, runs);
  expect(ticksOf(next, axis)).toEqual([true, true, true]);
  expect(next.none).toBe(false);
  expect(ticksOf(withTick(next, axis, 2, false, runs), axis)[2]).toBe(false);
});
