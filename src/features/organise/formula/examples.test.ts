import { expect, it } from 'vitest';
import { specCatalogue } from '@/test/catalogue';
import { exampleFor } from './examples';
import { readLine, type FormulaScope } from './parse';

const catalogue = specCatalogue();
const task: FormulaScope = {
  where: 'task',
  names: ['points', 'seconds_late'],
  sets: ['small', 'all'],
  each: [
    'small.score',
    'small.passed',
    'small.time_ms',
    'all.score',
    'all.passed',
    'all.time_ms',
  ],
  fields: { score: 'number', passed: 'number', time_ms: 'number' },
};
const board: FormulaScope = {
  where: 'leaderboard',
  names: ['islands_pick', 'points'],
  picks: ['islands_pick'],
  sets: ['islands'],
  each: ['islands.points', 'islands.seconds', 'islands.attempt'],
  fields: { points: 'number', seconds: 'number', attempt: 'number' },
};

it('checks every offered example in task, empty-group and leaderboard scopes', () => {
  for (const scope of [task, { ...task, sets: [], each: [] }, board]) {
    for (const block of catalogue.blocks) {
      const example = exampleFor(block, scope, catalogue);
      if (example === null) continue;
      const result = readLine(example.formula, scope, catalogue);
      expect(result.unread, example.formula).toBeNull();
      expect(result.problems, example.formula).toEqual([]);
      expect(result.node).not.toBeNull();
      expect(example.words).not.toBe('');
    }
  }
});

it('uses actual group and column names and drops examples without the names they need', () => {
  const sum = catalogue.blocks.find((block) => block.name === 'sum')!;
  expect(exampleFor(sum, task, catalogue)?.formula).toBe('sum(small.score)');
  expect(exampleFor(sum, { ...task, sets: [], each: [] }, catalogue)).toBeNull();
  expect(exampleFor({ ...sum, name: 'future' }, task, catalogue)).toBeNull();
  expect(exampleFor(sum, { ...task, texts: task.each }, catalogue)).toBeNull();
});
