import { namesIn, type Ast } from './parse';
import type { GraphBox, GraphWire } from '../flow/graph';

export function sourcesOf(node: Ast | null, names: ReadonlySet<string>): string[] {
  if (node === null) return [];
  return [
    ...new Set(
      namesIn(node)
        .map((name) => (names.has(name) ? name : name.split('.')[0]))
        .filter((name): name is string => name !== undefined && names.has(name)),
    ),
  ];
}

export type FlowAbout = { name: string; kind: string; description?: string };

/** The names first read on the left, with one wire each into this formula. */
export function flowOf(
  tree: Ast | null,
  names: ReadonlyMap<string, Omit<FlowAbout, 'name'>>,
  about: FlowAbout,
): { boxes: GraphBox[]; wires: GraphWire[] } {
  const sources = sourcesOf(tree, new Set(names.keys()));
  return {
    boxes: [
      ...sources.map((name): GraphBox => ({
        id: `source:${name}`,
        title: name,
        role: 'input',
        kind: names.get(name)?.kind ?? '',
        description: names.get(name)?.description,
        ports: [{ name, side: 'out' }],
      })),
      {
        id: 'self',
        title: about.name,
        kind: about.kind,
        description: about.description,
        role: 'output',
        ports: sources.map((name) => ({ name, side: 'in' })),
      },
    ],
    wires: sources.map((name) => {
      const fields =
        tree === null
          ? []
          : [
              ...new Set(
                namesIn(tree)
                  .filter((read) => read.startsWith(`${name}.`))
                  .map((read) => read.slice(name.length + 1)),
              ),
            ];
      return {
        from: `source:${name}`,
        fromPort: name,
        to: 'self',
        toPort: name,
        label: fields.length === 0 ? undefined : fields.join(', '),
      };
    }),
  };
}
