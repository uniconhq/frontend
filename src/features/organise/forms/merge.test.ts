import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  adminOnly,
  bothChanged,
  defaultSide,
  differences,
  mergeText,
  pathText,
  type FieldDiff,
  type Side,
} from './merge';
import { isoOf, localOf } from './times';
import { parseYaml, Time, writeAt, writeYaml } from './yaml-doc';

const BASE = `name: Spring   # shown on the page
start: 2026-06-01T09:00:00Z
registration:
  approval: manual
tasks:
  - {id: sum, worth: 100}
  - id: sort
    worth: 50
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
      writeAt(doc, ['name'], 'Spring 2026');
      writeAt(doc, ['tasks', 0, 'due'], new Time('2026-06-01T12:00:00+08:00'));
    });
    expect(text).toBe(
      `name: Spring 2026 # shown on the page
start: 2026-06-01T09:00:00Z
registration:
  approval: manual
tasks:
  - {id: sum, worth: 100, due: 2026-06-01T12:00:00+08:00}
  - id: sort
    worth: 50
`,
    );
  });

  it('removes a key and, when asked, the mapping it leaves empty', () => {
    const text = edit(BASE, (doc) => {
      writeAt(doc, ['registration', 'approval'], undefined, { prune: true });
    });
    expect(parse(text)).not.toHaveProperty('registration');
  });

  it('gives a key written with nothing after it a mapping for a field under it', () => {
    const text = edit('test_groups:\n  samples:\n', (doc) => {
      writeAt(doc, ['test_groups', 'samples', 'each'], 10);
    });
    expect(parse(text)).toEqual({ test_groups: { samples: { each: 10 } } });
  });

  it('refuses text that is not YAML with the reason', () => {
    expect(parseYaml('a: [1,\n')).toHaveProperty('error');
  });
});

describe('times', () => {
  it('shows a stored time in local time and writes back the same moment with an offset', () => {
    const local = localOf('2026-06-01T09:00:00Z');
    expect(local).toMatch(/^2026-0[56]-\d\dT\d\d:\d\d$/);
    const back = isoOf(local);
    expect(back).toMatch(/^2026-0[56]-\d\dT\d\d:\d\d:00[+-]\d\d:\d\d$/);
    expect(Date.parse(back ?? '')).toBe(Date.parse('2026-06-01T09:00:00Z'));
  });

  it('cannot show a time without a zone', () => {
    expect(localOf('2026-06-01')).toBe('');
    expect(localOf('2026-06-01T09:00:00')).toBe('');
  });
});

describe('merging two versions field by field', () => {
  const mine = edit(BASE, (doc) => {
    writeAt(doc, ['name'], 'Mine');
    writeAt(doc, ['tasks', 1, 'worth'], 70);
  });
  const theirs = edit(BASE, (doc) => {
    writeAt(doc, ['name'], 'Theirs');
    writeAt(doc, ['start'], '2026-06-02T09:00:00Z');
    writeAt(doc, ['registration', 'approval'], 'auto');
  });
  const diffs = differences(parse(BASE), parse(mine), parse(theirs), 'contest.yaml');

  it('lists every field that differs, at its path, each task by its id', () => {
    expect(diffs.map((diff) => pathText(diff.path))).toEqual([
      'name',
      'start',
      'registration.approval',
      'tasks[sort].worth',
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
      tasks: [
        { id: 'sum', worth: 100 },
        { id: 'sort', worth: 70 },
      ],
    });
    expect(merged).toContain('# shown on the page');
  });

  it('removes a field the organiser removed, when theirs is picked away', () => {
    const removed = edit(BASE, (doc) => writeAt(doc, ['registration'], undefined));
    const found = differences(parse(BASE), parse(removed), parse(BASE), 'contest.yaml');
    expect(found.map((diff) => pathText(diff.path))).toEqual(['registration']);
    expect(parse(mergeText(BASE, found, ['mine']))).not.toHaveProperty('registration');
  });
});

describe('merging a keyed list item by item', () => {
  /** The diffs of two edits of BASE, with the side each starts on. */
  function merge(
    mineOf: (doc: ReturnType<typeof docOf>) => void,
    theirsOf: (doc: ReturnType<typeof docOf>) => void,
  ) {
    const mine = edit(BASE, mineOf);
    const theirs = edit(BASE, theirsOf);
    const diffs = differences(parse(BASE), parse(mine), parse(theirs), 'contest.yaml');
    return { mine, theirs, diffs };
  }
  const labels = (diffs: FieldDiff[]) =>
    diffs.map((diff) => `${diff.kind} ${pathText(diff.path)}`);
  const merged = (theirs: string, diffs: FieldDiff[], choices?: Side[]) =>
    parse(mergeText(theirs, diffs, choices ?? diffs.map(defaultSide))) as {
      tasks: Record<string, unknown>[];
    };
  const swap = (doc: ReturnType<typeof docOf>) => {
    const list = doc.get('tasks', true) as { items: unknown[] };
    list.items.reverse();
  };

  it('writes a field onto its own task when the other side reordered the list', () => {
    const { theirs, diffs } = merge(
      (doc) => writeAt(doc, ['tasks', 1, 'due'], '2026-06-01T12:00:00Z'),
      swap,
    );
    expect(labels(diffs)).toEqual(['order tasks', 'field tasks[sort].due']);
    expect(diffs.map(defaultSide)).toEqual(['theirs', 'mine']);
    expect(merged(theirs, diffs).tasks).toEqual([
      { id: 'sort', worth: 50, due: '2026-06-01T12:00:00Z' },
      { id: 'sum', worth: 100 },
    ]);
  });

  it("keeps the organiser's order when they pick it, every task moving whole", () => {
    const { theirs, diffs } = merge(swap, (doc) =>
      writeAt(doc, ['tasks', 0, 'worth'], 90),
    );
    expect(labels(diffs)).toEqual(['order tasks', 'field tasks[sum].worth']);
    expect(diffs.map(defaultSide)).toEqual(['mine', 'theirs']);
    expect(merged(theirs, diffs).tasks).toEqual([
      { id: 'sort', worth: 50 },
      { id: 'sum', worth: 90 },
    ]);
  });

  it('keeps a task the other side inserted in the middle, and an inserted one of the organiser where they put it', () => {
    const insert = (id: string) => (doc: ReturnType<typeof docOf>) => {
      const list = doc.get('tasks', true) as { items: unknown[] };
      list.items.splice(1, 0, doc.createNode({ id }));
    };
    const { theirs, diffs } = merge(insert('mine'), insert('theirs'));
    expect(labels(diffs)).toEqual(['item tasks[theirs]', 'item tasks[mine]']);
    expect(diffs.map(defaultSide)).toEqual(['theirs', 'mine']);
    expect(merged(theirs, diffs).tasks.map((task) => task['id'])).toEqual([
      'sum',
      'mine',
      'theirs',
      'sort',
    ]);
  });

  it('removes a task the other side removed, and offers back one the organiser changed', () => {
    const remove = (doc: ReturnType<typeof docOf>) =>
      writeAt(doc, ['tasks', 0], undefined);
    const untouched = merge((doc) => writeAt(doc, ['tasks', 1, 'worth'], 60), remove);
    expect(labels(untouched.diffs)).toEqual([
      'field tasks[sort].worth',
      'item tasks[sum]',
    ]);
    expect(merged(untouched.theirs, untouched.diffs).tasks).toEqual([
      { id: 'sort', worth: 60 },
    ]);

    const changed = merge((doc) => writeAt(doc, ['tasks', 0, 'worth'], 80), remove);
    const [item] = changed.diffs;
    expect(item && bothChanged(item)).toBe(true);
    expect(changed.diffs.map(defaultSide)).toEqual(['mine']);
    expect(merged(changed.theirs, changed.diffs).tasks).toEqual([
      { id: 'sum', worth: 80 },
      { id: 'sort', worth: 50 },
    ]);
  });

  it("names a field both sides changed on the same task by the task's id", () => {
    const { theirs, diffs } = merge(
      (doc) => writeAt(doc, ['tasks', 0, 'due'], '2026-06-01T12:00:00Z'),
      (doc) => {
        swap(doc);
        writeAt(doc, ['tasks', 1, 'due'], '2026-06-01T13:00:00Z');
      },
    );
    expect(labels(diffs)).toEqual(['order tasks', 'field tasks[sum].due']);
    const [, due] = diffs;
    expect(due && bothChanged(due)).toBe(true);
    expect(merged(theirs, diffs).tasks).toEqual([
      { id: 'sort', worth: 50 },
      { id: 'sum', worth: 100, due: '2026-06-01T12:00:00Z' },
    ]);
  });

  it('reads two offsets for the same moment as the same time', () => {
    const { diffs } = merge(
      (doc) => writeAt(doc, ['start'], '2026-06-01T17:00:00+08:00'),
      (doc) => writeAt(doc, ['tasks', 0, 'due'], '2026-06-01T12:00:00Z'),
    );
    expect(labels(diffs)).toEqual(['field tasks[sum].due']);
  });

  it("holds a manager's admin-only keys to the current version", () => {
    const { diffs } = merge(
      (doc) => writeAt(doc, ['registration', 'approval'], 'auto'),
      (doc) => writeAt(doc, ['name'], 'Theirs'),
    );
    expect(diffs.map((diff) => adminOnly(diff, 'contest.yaml'))).toEqual([true, true]);
    const before = { name: 'a', submissions: { max: 3 }, workflow: 'x' };
    const task = differences(
      before,
      { name: 'a', submissions: { max: 4 }, workflow: 'y' },
      before,
      'task.yaml',
    );
    expect(task.map((diff) => adminOnly(diff, 'task.yaml'))).toEqual([true, false]);
  });
});
