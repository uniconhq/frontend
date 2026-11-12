import { expect, it } from 'vitest';
import { pairRunFiles } from './run-files';
import { emptyTuple } from '../forms/task-values';
const axis = { inputs: ['input', 'answer'], tuples: [emptyTuple(['input', 'answer'])] };
it('pairs 1.in with 1.ans in one row', () => {
  const input = new File(['1'], '1.in');
  const answer = new File(['2'], '1.ans');
  const result = pairRunFiles([input, answer], axis, ['input', 'answer']);
  expect(result.problems).toEqual([]);
  expect(result.axis.tuples).toHaveLength(1);
  expect(result.pairs.map((pair) => [pair.row, pair.input])).toEqual([
    [0, 'input'],
    [0, 'answer'],
  ]);
});
it('refuses ambiguous files before changing the table', () => {
  const result = pairRunFiles([new File(['1'], '1.xyz')], axis, ['input', 'answer']);
  expect(result.problems).toEqual(['No column matches 1.xyz.']);
});
