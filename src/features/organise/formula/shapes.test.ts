import { expect, it } from 'vitest';
import { specCatalogue } from './catalogue';
import { columnOf, inputWords, kindWords, shapeOf } from './shapes';

const catalogue = specCatalogue();

it('places every catalogue block by its available forms and keeps every shape short', () => {
  const columns = Object.fromEntries(
    catalogue.blocks.map((block) => [block.name, columnOf(block)]),
  );
  expect(columns).toEqual({
    add: 'maths',
    sub: 'maths',
    mul: 'maths',
    div: 'maths',
    lt: 'maths',
    le: 'maths',
    gt: 'maths',
    ge: 'maths',
    eq: 'maths',
    ne: 'maths',
    and: 'maths',
    or: 'maths',
    not: 'maths',
    if: 'maths',
    min: 'many',
    max: 'many',
    floor: 'maths',
    ceil: 'maths',
    sum: 'many',
    count: 'many',
    first: 'pick',
    latest: 'pick',
    highest: 'pick',
    lowest: 'pick',
    last: 'pick',
    best_each: 'many',
    otherwise: 'maths',
    sum_best: 'maths',
    exec: 'program',
    entered: 'maths',
  });
  for (const where of ['task', 'leaderboard'] as const) {
    for (const block of catalogue.blocks) {
      const forms = block.forms.filter(
        (form) => form.scope === 'both' || form.scope === where,
      );
      if (forms.length === 0) continue;
      expect(
        shapeOf({ ...block, forms }).length,
        `${where}: ${block.name}`,
      ).toBeLessThanOrEqual(32);
    }
  }
  const sum = catalogue.blocks.find((block) => block.name === 'sum');
  expect(sum && shapeOf(sum)).toBe('numbers → one number');
  const first = catalogue.blocks.find((block) => block.name === 'first');
  expect(first && shapeOf({ ...first, forms: first.forms.slice(0, 1) })).toBe(
    'a group → one run',
  );
  const min = catalogue.blocks.find((block) => block.name === 'min');
  expect(min && shapeOf(min)).toBe('numbers → one number');
});

it('uses input kinds for a new block and explains per-run inputs and limits', () => {
  expect(kindWords('results')).toBe("a task's results");
  const block = catalogue.blocks[0]!;
  expect(columnOf({ ...block, name: 'future', forms: [] })).toBe('maths');
  expect(
    inputWords(
      { kind: 'number', least: 2, most: 3, per_run: true, optional: true, plain: true },
      'task',
    ),
  ).toBe('a number for each run, written out (at least 2, at most 3)');
});
