import type { Catalogue } from './catalogue';

type BlockForm = Catalogue['blocks'][number]['forms'][number];
type Gives = 'number' | 'text' | 'run';

const LEAVES = new Set([
  'runs',
  'run',
  'value',
  'fact',
  'text',
  'results',
  'column',
  'name',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function leafOf(node: Record<string, unknown>): [string, unknown] | null {
  const entries = Object.entries(node);
  const [first] = entries;
  if (entries.length !== 1 || first === undefined || !LEAVES.has(first[0])) return null;
  return first;
}

const GATHERED: Record<string, string> = { runs: 'runs', results: 'results' };

/** Whether `node`'s inputs fit `form`: by name, by list or one, by gathered leaf. */
function fits(form: BlockForm, node: Record<string, unknown>): boolean {
  const given = Object.keys(node).filter((key) => key !== 'block');
  if (given.some((key) => !(key in form.inputs))) return false;
  if (
    Object.entries(form.inputs).some(
      ([key, wanted]) => !wanted.optional && !(key in node),
    )
  )
    return false;
  return given.every((key) => {
    const wanted = form.inputs[key];
    const value = node[key];
    if (wanted === undefined) return false;
    if (Array.isArray(value) !== (wanted.least !== null)) return false;
    return (Array.isArray(value) ? value : [value]).every((each) => {
      const leaf = isRecord(each) ? leafOf(each) : null;
      const gathered = leaf !== null && leaf[0] in GATHERED ? leaf[0] : null;
      return gathered === (GATHERED[wanted.kind] ?? null);
    });
  });
}

/**
 * The form of a block a stored node means, as the forge's `form_of` reads a
 * task's value: the first its inputs fit, else the only form a task can use.
 */
function formOf(catalogue: Catalogue, node: Record<string, unknown>): BlockForm | null {
  const block = catalogue.blocks.find((item) => item.name === node['block']);
  if (block === undefined) return null;
  const fitting = block.forms.find((form) => fits(form, node));
  if (fitting !== undefined) return fitting;
  const usable = block.forms.filter((form) => form.scope !== 'leaderboard');
  return usable.length === 1 ? (usable[0] ?? null) : null;
}

/**
 * Whether each of a task's values gives text, as the forge's `_tree_gives`
 * reads a stored tree (forge domain/blocks/check.py): a text; a run's column
 * that is text (`texts`, such as `verdict` or a text input an axis fills);
 * another value that gives text, followed by name; or a block that gives a
 * number or text whose number-or-text inputs all give text, such as an `if`
 * choosing between two texts. Anything else gives a number.
 */
export function textValues(
  values: Readonly<Record<string, unknown>>,
  texts: ReadonlySet<string>,
  catalogue: Catalogue,
): Set<string> {
  const kinds = new Map<string, Gives>();
  const valueKind = (name: string, seen: Set<string>): Gives => {
    const cached = kinds.get(name);
    if (cached !== undefined) return cached;
    if (!(name in values) || seen.has(name)) return 'number';
    seen.add(name);
    const kind = treeGives(values[name], seen);
    seen.delete(name);
    kinds.set(name, kind);
    return kind;
  };
  const treeGives = (node: unknown, seen: Set<string>): Gives => {
    if (!isRecord(node)) return 'number';
    if (Object.keys(node).length === 1 && typeof node['text'] === 'string')
      return 'text';
    if (typeof node['block'] === 'string') {
      const form = formOf(catalogue, node);
      if (form === null) return 'number';
      if (form.gives === 'run') return 'run';
      if (form.gives !== 'number_or_text' && form.gives !== 'either') return 'number';
      const found = Object.entries(form.inputs)
        .filter(([key, wanted]) => wanted.kind === 'number_or_text' && key in node)
        .flatMap(([key]) => {
          const given = node[key];
          return (Array.isArray(given) ? given : [given]).map((each) =>
            treeGives(each, seen),
          );
        });
      if (found.includes('text') && !found.includes('number') && !found.includes('run'))
        return 'text';
      return found.includes('run') ? 'run' : 'number';
    }
    const leaf = leafOf(node);
    if (leaf === null) return 'number';
    const [kind, named] = leaf;
    if (kind === 'value' && typeof named === 'string') return valueKind(named, seen);
    if (kind === 'run') {
      const column: unknown =
        Array.isArray(named) && named.length === 2 ? named[1] : null;
      return typeof column === 'string' && texts.has(column) ? 'text' : 'number';
    }
    return 'number';
  };
  return new Set(
    Object.keys(values).filter((name) => valueKind(name, new Set()) === 'text'),
  );
}
