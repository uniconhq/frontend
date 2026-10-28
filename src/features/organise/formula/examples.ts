import { type Catalogue } from './catalogue';
import { describeFormula, readLine, type FormulaScope } from './parse';

type Example = { formula: string; words: string };
type Starter = Example & { name: string };

function checked(
  formula: string | undefined,
  scope: FormulaScope,
  catalogue: Catalogue,
): Example | null {
  if (formula === undefined) return null;
  const reading = readLine(formula, scope, catalogue);
  return reading.node !== null &&
    reading.unread === null &&
    reading.problems.length === 0
    ? { formula, words: describeFormula(reading.node, scope) }
    : null;
}

export function exampleFor(
  block: Catalogue['blocks'][number],
  scope: FormulaScope,
  catalogue: Catalogue,
): Example | null {
  const set = scope.sets[0];
  const column =
    scope.each.find(
      (name) => name === `${set}.score` && !scope.texts?.includes(name),
    ) ??
    scope.each.find(
      (name) => name.startsWith(`${set}.`) && !scope.texts?.includes(name),
    );
  const number =
    scope.names.find(
      (name) => !scope.texts?.includes(name) && !scope.picks?.includes(name),
    ) ?? '1';
  const other =
    scope.names.find(
      (name) =>
        name !== number && !scope.texts?.includes(name) && !scope.picks?.includes(name),
    ) ?? '2';
  const binary: Record<string, string> = {
    add: '+',
    sub: '-',
    mul: '*',
    div: '/',
    lt: '<',
    le: '<=',
    gt: '>',
    ge: '>=',
    eq: '==',
    ne: '!=',
    and: 'and',
    or: 'or',
  };
  const symbol = binary[block.name];
  if (symbol !== undefined)
    return checked(`${number} ${symbol} ${other}`, scope, catalogue);
  const templates: Record<string, string | undefined> = {
    not: `not ${number}`,
    if: `if(${number} > 0, ${number}, 0)`,
    min: column === undefined ? `min(${number}, ${other})` : `min(${column})`,
    max: column === undefined ? `max(${number}, ${other})` : `max(${column})`,
    floor: `floor(${number})`,
    ceil: `ceil(${number})`,
    sum: column === undefined ? undefined : `sum(${column})`,
    count: set === undefined ? undefined : `count(${set})`,
    first: set === undefined ? undefined : `first(${set})`,
    last: set === undefined ? undefined : `last(${set})`,
    latest: set === undefined ? undefined : `latest(${set})`,
    highest: column === undefined ? undefined : `highest(${set}, by: ${column})`,
    lowest: column === undefined ? undefined : `lowest(${set}, by: ${column})`,
    best_each:
      column === undefined
        ? undefined
        : `best_each(${set}, ${column.split('.')[1]}, {${column.split('.')[1]}: desc})`,
    otherwise: `otherwise(${number}, 0)`,
    sum_best: `sum_best(k: 1, ${number}, ${other})`,
    entered: 'entered(0, 100)',
    // A program example needs a real folder; the scope does not promise one.
  };
  return checked(templates[block.name], scope, catalogue);
}

export function startersFor(scope: FormulaScope, catalogue: Catalogue): Starter[] {
  const task = scope.sets[0];
  const pick = scope.names.find(
    (name) => name === `${task}_pick` && scope.picks?.includes(name),
  );
  const templates: [string, string | undefined][] =
    scope.where === 'task'
      ? [
          [
            'Total score',
            scope.each.includes('all.score') ? 'sum(all.score)' : undefined,
          ],
          [
            'Runs passed',
            scope.each.includes('all.passed')
              ? 'count(all, all.passed == 1)'
              : undefined,
          ],
          [
            'Fastest time',
            scope.each.includes('all.time_ms') ? 'min(all.time_ms)' : undefined,
          ],
        ]
      : [
          [
            'Best submission',
            task === undefined || !scope.each.includes(`${task}.points`)
              ? undefined
              : `highest(${task}, by: ${task}.points)`,
          ],
          ['Points', pick === undefined ? undefined : `otherwise(${pick}.points, 0)`],
          [
            'Penalty',
            pick === undefined
              ? undefined
              : `if(${pick}, floor(${pick}.seconds / 60) + 20 * (${pick}.attempt - 1), 0)`,
          ],
        ];
  return templates
    .flatMap(([name, formula]) => {
      const example = checked(formula, scope, catalogue);
      return example === null ? [] : [{ name, ...example }];
    })
    .slice(0, 3);
}
