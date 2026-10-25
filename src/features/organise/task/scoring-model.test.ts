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
