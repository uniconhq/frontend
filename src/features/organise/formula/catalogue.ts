import type { components } from '@/api/schema';

/**
 * The catalogue `GET /blocks` serves, narrowed to the forms the formula
 * editor reads. A test builds this; the page itself reads the endpoint.
 */
export type Catalogue = components['schemas']['Catalogue'];

type Block = components['schemas']['Block'];
type BlockForm = components['schemas']['BlockForm'];
type BlockInput = components['schemas']['BlockInput'];
type Kind = BlockInput['kind'];

function input(kind: Kind, extra: Partial<BlockInput> = {}): BlockInput {
  return {
    kind,
    least: null,
    most: null,
    optional: false,
    per_run: false,
    plain: false,
    ...extra,
  };
}

const pair = input('number', { least: 2, most: 2 });
const valuePair = input('number_or_text', { least: 2, most: 2 });
const some = input('number', { least: 2 });
const one = input('number');
const value = input('number_or_text');
const bound = input('number', { plain: true });
const where = input('number', { optional: true, per_run: true });
const missing = input('missing', { optional: true });
const limit = input('number', { optional: true, plain: true });

function numbers(of: BlockInput): BlockForm {
  return { given: 'numbers', inputs: { of }, scope: 'both', gives: 'number' };
}

function fold(of: boolean, weights: boolean): BlockForm {
  const inputs: BlockForm['inputs'] = { over: input('runs') };
  if (of) inputs.of = input('number', { per_run: true });
  inputs.where = where;
  if (weights) inputs.weights = input('weights', { optional: true });
  inputs.missing = missing;
  return { given: "a group's runs", inputs, scope: 'task', gives: 'number' };
}

function overResults(of: boolean): BlockForm {
  const inputs: BlockForm['inputs'] = { over: input('results') };
  if (of) inputs.of = input('number', { per_run: true });
  inputs.where = where;
  inputs.missing = missing;
  return { given: "a task's results", inputs, scope: 'leaderboard', gives: 'number' };
}

function taskPick(by: boolean): BlockForm {
  const inputs: BlockForm['inputs'] = { from: input('runs') };
  if (by) inputs.by = input('number', { per_run: true });
  else inputs.where = where;
  return { given: "a group's runs", inputs, scope: 'task', gives: 'run' };
}

function leaderboardPick(by: boolean): BlockForm {
  const inputs: BlockForm['inputs'] = { from: input('results') };
  if (by) inputs.by = input('number', { per_run: true });
  inputs.where = where;
  inputs.missing = missing;
  return {
    given: "a task's results",
    inputs,
    scope: 'leaderboard',
    gives: 'submission',
  };
}

function numberBlock(name: string, words: string, of: BlockInput): Block {
  return { name, words, forms: [numbers(of)] };
}

function pickBlock(name: string, words: string, by: boolean, task: boolean): Block {
  return {
    name,
    words,
    forms: task ? [taskPick(by), leaderboardPick(by)] : [leaderboardPick(by)],
  };
}

/**
 * The blocks a value or a column may use, in the catalogue's order, with
 * the same forms the forge serves. Symbols (`+`, `==`) are not blocks;
 * they compile to `add`, `eq` and the rest.
 */
export function specCatalogue(): Catalogue {
  const blocks: Block[] = [
    numberBlock('add', 'the sum of its inputs', some),
    numberBlock('sub', 'the first input less the second', pair),
    numberBlock('mul', 'the product of its inputs', some),
    numberBlock('div', 'the first input over the second, missing when it is 0', pair),
    numberBlock('lt', '1 when the first input is less than the second, else 0', pair),
    numberBlock('le', '1 when the first input is at most the second, else 0', pair),
    numberBlock('gt', '1 when the first input is more than the second, else 0', pair),
    numberBlock('ge', '1 when the first input is at least the second, else 0', pair),
    numberBlock(
      'eq',
      '1 when its two inputs are equal, else 0, numbers or text',
      valuePair,
    ),
    numberBlock(
      'ne',
      '1 when its two inputs differ, else 0, numbers or text',
      valuePair,
    ),
    numberBlock('and', '1 when no input is 0, else 0', some),
    numberBlock('or', '1 when some input is not 0, else 0', some),
    numberBlock('not', '1 when its input is 0, else 0', one),
    {
      name: 'if',
      words: 'then when test is not 0, else else, reading only the branch it takes',
      forms: [
        {
          given: 'numbers',
          inputs: { test: input('either'), then: value, else: value },
          scope: 'both',
          gives: 'number_or_text',
        },
      ],
    },
    {
      name: 'min',
      words: 'the least of its inputs, or of a column over runs or results',
      forms: [numbers(some), fold(true, false), overResults(true)],
    },
    {
      name: 'max',
      words: 'the most of its inputs, or of a column over runs or results',
      forms: [numbers(some), fold(true, false), overResults(true)],
    },
    numberBlock('floor', 'its input rounded down to a whole number', one),
    numberBlock('ceil', 'its input rounded up to a whole number', one),
    {
      name: 'sum',
      words: "a column summed over a group's runs, or a value over a task's results",
      forms: [fold(true, true), overResults(true)],
    },
    {
      name: 'count',
      words: "how many of a group's runs, or of a task's results",
      forms: [fold(false, true), overResults(false)],
    },
    pickBlock(
      'first',
      "the first of a group's runs, or the oldest result",
      false,
      true,
    ),
    pickBlock('latest', 'the newest result that where keeps', false, false),
    pickBlock('highest', 'the run or result with the highest by', true, true),
    pickBlock('lowest', 'the run or result with the lowest by', true, true),
    {
      name: 'last',
      words: "the last of a group's runs that where keeps",
      forms: [taskPick(false)],
    },
    {
      name: 'best_each',
      words: "the task's value from the best of each value it reads",
      forms: [
        {
          given: "a task's results",
          inputs: {
            from: input('results'),
            value: input('name'),
            directions: input('directions'),
            missing,
          },
          scope: 'leaderboard',
          gives: 'number',
        },
      ],
    },
    {
      name: 'otherwise',
      words: 'the first input, or the second when the first is missing',
      forms: [
        {
          given: 'numbers or text',
          inputs: { of: input('number_or_text', { least: 2, most: 2 }) },
          scope: 'both',
          gives: 'number_or_text',
        },
        {
          given: "submissions' results",
          inputs: { of: input('either', { least: 2, most: 2 }) },
          scope: 'both',
          gives: 'either',
        },
      ],
    },
    {
      name: 'sum_best',
      words: 'the sum of the k largest of its inputs',
      forms: [
        {
          given: 'numbers',
          inputs: {
            k: input('number', { plain: true }),
            of: input('number', { least: 1 }),
          },
          scope: 'leaderboard',
          gives: 'number',
        },
      ],
    },
    {
      name: 'exec',
      words: "the one number a program reports from a group's runs",
      forms: [
        {
          given: "a group's runs",
          inputs: {
            program: input('path'),
            language: input('language'),
            over: input('runs'),
            time_limit: limit,
            memory_limit: limit,
          },
          scope: 'task',
          gives: 'number',
        },
      ],
    },
    {
      name: 'entered',
      words: 'the mark a manager of the task enters',
      forms: [
        {
          given: 'numbers',
          inputs: { at_least: bound, at_most: bound },
          scope: 'task',
          gives: 'number',
        },
      ],
    },
  ];
  return {
    blocks,
    leaves: ['runs', 'run', 'value', 'fact', 'text'],
    facts: ['seconds_late', 'seconds', 'compiled'],
    leaderboard_leaves: ['value', 'results', 'column', 'name'],
    leaderboard_facts: ['attempt', 'seconds', 'seconds_late', 'marked', 'compiled'],
    skip: 'skip',
    languages: ['c', 'cpp', 'java', 'python', 'ipynb'],
  };
}
