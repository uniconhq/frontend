import { expect, it } from 'vitest';
import { flowOf } from './flow';
import { parseFormula } from './parse';

const names = new Map([
  ['small', { kind: 'group', description: 'Small tests' }],
  ['late', { kind: 'value', description: 'Late penalty' }],
]);
function flow(text: string) {
  const parsed = parseFormula(text);
  if (!parsed.ok) throw new Error(parsed.message);
  return flowOf(parsed.node, names, { name: 'points', kind: 'number' });
}
it('draws one wire per source in the order first read', () => {
  const result = flow('late + sum(small.score) + late');
  expect(result.boxes.map((box) => box.title)).toEqual(['late', 'small', 'points']);
  expect(result.wires.find((wire) => wire.from === 'source:small')?.label).toBe(
    'score',
  );
  expect(result.wires.map((wire) => wire.from)).toEqual([
    'source:late',
    'source:small',
  ]);
});
it('has no source for a constant', () => {
  expect(flow('1').wires).toEqual([]);
});
