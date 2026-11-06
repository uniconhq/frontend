import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  bothChanged,
  defaultSide,
  differences,
  mergeText,
  pathText,
  type FieldDiff,
  type Side,
} from './merge';
import { exactJS, NumberText, parseYaml, writeAt, writeYaml } from './yaml-doc';

const BASE = `name: sum   # shown on the page
description: Adds two numbers
outputs:
  score: {from: x}
steps:
  - {id: build, timeout: 2}
  - id: run
    timeout: 1
`;

function edit(text: string, change: (doc: ReturnType<typeof docOf>) => void) {
  const doc = docOf(text);
  change(doc);
  return writeYaml(doc);
}

function docOf(text: string) {
  const parsed = parseYaml(text);
  if ('error' in parsed) throw new Error(parsed.error);
  return parsed.doc;
}

describe('editing a file as a document', () => {
  it('changes only the nodes written, keeping comments, order and flow style', () => {
    const text = edit(BASE, (doc) => {
      writeAt(doc, ['name'], 'sums');
      writeAt(doc, ['steps', 0, 'memory'], 64);
    });
    expect(text).toBe(
      `name: sums # shown on the page
description: Adds two numbers
outputs:
  score: {from: x}
steps:
  - {id: build, timeout: 2, memory: 64}
  - id: run
    timeout: 1
`,
    );
  });

  it('removes a key and, when asked, the mapping it leaves empty', () => {
    const text = edit(BASE, (doc) => {
      writeAt(doc, ['outputs', 'score'], undefined, { prune: true });
    });
    expect(parse(text)).not.toHaveProperty('outputs');
  });

  it('gives a key written with nothing after it a mapping for a field under it', () => {
    const text = edit('inputs:\n  code:\n', (doc) => {
      writeAt(doc, ['inputs', 'code', 'max'], 10);
    });
    expect(parse(text)).toEqual({ inputs: { code: { max: 10 } } });
  });

  it('refuses text that is not YAML with the reason', () => {
    expect(parseYaml('a: [1,\n')).toHaveProperty('error');
  });
});

describe('merging a number past what a float holds', () => {
  const FILE = 'name: sum\ninputs:\n  tolerance: 0.123456789012345678901\n';
  const exact = (text: string) => exactJS(docOf(text));
  const mine = edit(FILE, (doc) => {
    writeAt(doc, ['inputs', 'tolerance'], new NumberText('0.123456789012345678902'));
  });
  const theirs = edit(FILE, (doc) => {
    writeAt(doc, ['name'], 'sums');
  });

  it("sees a change to the last digit and writes the organiser's digits", () => {
    const diffs = differences(exact(FILE), exact(mine), exact(theirs));

    expect(diffs.map((diff) => pathText(diff.path))).toEqual([
      'name',
      'inputs.tolerance',
    ]);
    expect(mergeText(theirs, diffs, ['theirs', 'mine'])).toBe(
      'name: sums\ninputs:\n  tolerance: 0.123456789012345678902\n',
    );
  });

  it('takes a number spelled another way for the same number', () => {
    const spelled = FILE.replace('0.123456789012345678901', '0.1234567890123456789010');
    const hex = 'name: sum\ninputs:\n  seed: 0x10\n';

    expect(differences(exact(hex), exact(hex), exact(hex))).toEqual([]);
    expect(
      differences(exact(hex), exact(hex.replace('0x10', '0o20')), exact(hex)),
    ).toEqual([]);

    expect(differences(exact(FILE), exact(spelled), exact(FILE))).toEqual([]);
  });
});

describe('merging two versions field by field', () => {
  const mine = edit(BASE, (doc) => {
    writeAt(doc, ['name'], 'mine');
    writeAt(doc, ['steps', 1, 'timeout'], 3);
  });
  const theirs = edit(BASE, (doc) => {
    writeAt(doc, ['name'], 'theirs');
    writeAt(doc, ['description'], 'Adds more');
    writeAt(doc, ['outputs', 'score', 'from'], 'y');
  });
  const diffs = differences(parse(BASE), parse(mine), parse(theirs));

  it('lists every field that differs, at its path, each step by its id', () => {
    expect(diffs.map((diff) => pathText(diff.path))).toEqual([
      'name',
      'description',
      'outputs.score.from',
      'steps[run].timeout',
    ]);
  });

  it('starts each choice on the side that changed it, and marks a field both changed', () => {
    expect(diffs.map(defaultSide)).toEqual(['mine', 'theirs', 'theirs', 'mine']);
    expect(diffs.map(bothChanged)).toEqual([true, false, false, false]);
  });

  it('writes the chosen fields into the current file and leaves the rest as it is now', () => {
    const merged = mergeText(theirs, diffs, ['theirs', 'theirs', 'theirs', 'mine']);
    expect(parse(merged)).toEqual({
      ...parse(theirs),
      steps: [
        { id: 'build', timeout: 2 },
        { id: 'run', timeout: 3 },
      ],
    });
    expect(merged).toContain('# shown on the page');
  });

  it('removes a field the organiser removed, when theirs is picked away', () => {
    const removed = edit(BASE, (doc) => writeAt(doc, ['outputs'], undefined));
    const found = differences(parse(BASE), parse(removed), parse(BASE));
    expect(found.map((diff) => pathText(diff.path))).toEqual(['outputs']);
    expect(parse(mergeText(BASE, found, ['mine']))).not.toHaveProperty('outputs');
  });
});

describe('merging the steps one by one', () => {
  /** The diffs of two edits of BASE, with the side each starts on. */
  function merge(
    mineOf: (doc: ReturnType<typeof docOf>) => void,
    theirsOf: (doc: ReturnType<typeof docOf>) => void,
  ) {
    const mine = edit(BASE, mineOf);
    const theirs = edit(BASE, theirsOf);
    const diffs = differences(parse(BASE), parse(mine), parse(theirs));
    return { mine, theirs, diffs };
  }
  const labels = (diffs: FieldDiff[]) =>
    diffs.map((diff) => `${diff.kind} ${pathText(diff.path)}`);
  const merged = (theirs: string, diffs: FieldDiff[], choices?: Side[]) =>
    parse(mergeText(theirs, diffs, choices ?? diffs.map(defaultSide))) as {
      steps: Record<string, unknown>[];
    };
  const swap = (doc: ReturnType<typeof docOf>) => {
    const list = doc.get('steps', true) as { items: unknown[] };
    list.items.reverse();
  };

  it('writes a field onto its own step when the other side reordered the list', () => {
    const { theirs, diffs } = merge(
      (doc) => writeAt(doc, ['steps', 1, 'memory'], 64),
      swap,
    );
    expect(labels(diffs)).toEqual(['order steps', 'field steps[run].memory']);
    expect(diffs.map(defaultSide)).toEqual(['theirs', 'mine']);
    expect(merged(theirs, diffs).steps).toEqual([
      { id: 'run', timeout: 1, memory: 64 },
      { id: 'build', timeout: 2 },
    ]);
  });

  it('writes a step it puts in so it reads back as written', () => {
    const { theirs, diffs } = merge(
      (doc) => {
        const list = doc.get('steps', true) as { items: unknown[] };
        list.items.push(
          doc.createNode({ id: 'late', title: '2026-01-02', ok: 'true' }),
        );
      },
      () => undefined,
    );

    const text = mergeText(theirs, diffs, ['mine']);

    expect(text).toContain('title: 2026-01-02');
    expect(text).toContain('ok: "true"');
  });

  it("keeps the organiser's order when they pick it, every step moving whole", () => {
    const { theirs, diffs } = merge(swap, (doc) =>
      writeAt(doc, ['steps', 0, 'timeout'], 4),
    );
    expect(labels(diffs)).toEqual(['order steps', 'field steps[build].timeout']);
    expect(diffs.map(defaultSide)).toEqual(['mine', 'theirs']);
    expect(merged(theirs, diffs).steps).toEqual([
      { id: 'run', timeout: 1 },
      { id: 'build', timeout: 4 },
    ]);
  });

  it('keeps a step the other side inserted in the middle, and an inserted one of the organiser where they put it', () => {
    const insert = (id: string) => (doc: ReturnType<typeof docOf>) => {
      const list = doc.get('steps', true) as { items: unknown[] };
      list.items.splice(1, 0, doc.createNode({ id }));
    };
    const { theirs, diffs } = merge(insert('mine'), insert('theirs'));
    expect(labels(diffs)).toEqual(['item steps[theirs]', 'item steps[mine]']);
    expect(diffs.map(defaultSide)).toEqual(['theirs', 'mine']);
    expect(merged(theirs, diffs).steps.map((step) => step['id'])).toEqual([
      'build',
      'mine',
      'theirs',
      'run',
    ]);
  });

  it('removes a step the other side removed, and offers back one the organiser changed', () => {
    const remove = (doc: ReturnType<typeof docOf>) =>
      writeAt(doc, ['steps', 0], undefined);
    const untouched = merge((doc) => writeAt(doc, ['steps', 1, 'timeout'], 5), remove);
    expect(labels(untouched.diffs)).toEqual([
      'field steps[run].timeout',
      'item steps[build]',
    ]);
    expect(merged(untouched.theirs, untouched.diffs).steps).toEqual([
      { id: 'run', timeout: 5 },
    ]);

    const changed = merge((doc) => writeAt(doc, ['steps', 0, 'timeout'], 6), remove);
    const [item] = changed.diffs;
    expect(item && bothChanged(item)).toBe(true);
    expect(changed.diffs.map(defaultSide)).toEqual(['mine']);
    expect(merged(changed.theirs, changed.diffs).steps).toEqual([
      { id: 'build', timeout: 6 },
      { id: 'run', timeout: 1 },
    ]);
  });

  it("names a field both sides changed on the same step by the step's id", () => {
    const { theirs, diffs } = merge(
      (doc) => writeAt(doc, ['steps', 0, 'memory'], 32),
      (doc) => {
        swap(doc);
        writeAt(doc, ['steps', 1, 'memory'], 16);
      },
    );
    expect(labels(diffs)).toEqual(['order steps', 'field steps[build].memory']);
    const [, memory] = diffs;
    expect(memory && bothChanged(memory)).toBe(true);
    expect(merged(theirs, diffs).steps).toEqual([
      { id: 'run', timeout: 1 },
      { id: 'build', timeout: 2, memory: 32 },
    ]);
  });
});
