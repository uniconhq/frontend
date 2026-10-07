import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { defaultSide, differences, mergeText, pathText, bothChanged } from './merge';
import { isoOf, localOf } from './times';
import { parseYaml, writeAt, writeYaml } from './yaml-doc';

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
      writeAt(doc, ['tasks', 0, 'due'], '2026-06-01T12:00:00+08:00');
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
  const diffs = differences(parse(BASE), parse(mine), parse(theirs));

  it('lists every field that differs, at its path', () => {
    expect(diffs.map((diff) => pathText(diff.path))).toEqual([
      'name',
      'start',
      'registration.approval',
      'tasks[1].worth',
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
    const found = differences(parse(BASE), parse(removed), parse(BASE));
    expect(found.map((diff) => pathText(diff.path))).toEqual(['registration']);
    expect(parse(mergeText(BASE, found, ['mine']))).not.toHaveProperty('registration');
  });
});
