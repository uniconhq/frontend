import { describe, expect, it } from 'vitest';
import { parseYaml, writeAt, writeYaml, type Doc } from './yaml-doc';

function edited(text: string, edit: (doc: Doc) => void): string {
  const parsed = parseYaml(text);
  if ('error' in parsed) throw new Error(parsed.error);
  edit(parsed.doc);
  return writeYaml(parsed.doc);
}

describe('a definition file as the forge reads it', () => {
  it('makes a new mapping a plain one', () => {
    const text = edited('name: sum\n', (doc) => {
      writeAt(doc, ['submissions', 'rate'], { count: 10, per: 60 });
      writeAt(doc, ['submissions', 'max'], 50);
    });

    expect(text).toBe(
      'name: sum\nsubmissions:\n  rate: {count: 10, per: 60}\n  max: 50\n',
    );
  });

  it('keeps a time as the text it is written as', () => {
    const parsed = parseYaml('start: 2026-09-26T10:00:00Z\n');
    if ('error' in parsed) throw new Error(parsed.error);

    expect(parsed.doc.toJS()).toEqual({ start: '2026-09-26T10:00:00Z' });
  });

  it('quotes what 1.1 would read as true, false or a number', () => {
    const text = edited('a: 1\n', (doc) => {
      writeAt(doc, ['flag'], 'on');
      writeAt(doc, ['size'], '1_000');
      writeAt(doc, ['letter'], 'y');
    });

    expect(text).toBe('a: 1\nflag: "on"\nsize: "1_000"\nletter: y\n');
  });
});

describe('the scalars PyYAML reads otherwise', () => {
  it('quotes a date, = and << wherever a value is written', () => {
    const text = edited('a: 1\n', (doc) => {
      writeAt(doc, ['day'], '2026-10-09');
      writeAt(doc, ['eq'], '=');
      writeAt(doc, ['merge'], '<<');
      writeAt(doc, ['list'], ['2026-10-09', 'later']);
    });

    expect(text).toBe(
      'a: 1\nday: "2026-10-09"\neq: "="\nmerge: "<<"\nlist: ["2026-10-09", later]\n',
    );
  });

  it('keeps a merge key a file holds, and a time it holds bare', () => {
    const text = edited(
      'base: &b {x: 1}\nm:\n  <<: *b\n  y: 2\ndue: 2026-06-01T09:00:00Z\n',
      (doc) => {
        writeAt(doc, ['m', 'y'], '<<');
        writeAt(doc, ['due'], '2026-06-02T09:00:00Z');
      },
    );

    expect(text).toBe(
      'base: &b {x: 1}\nm:\n  <<: *b\n  y: "<<"\ndue: 2026-06-02T09:00:00Z\n',
    );
    const parsed = parseYaml(text);
    if ('error' in parsed) throw new Error(parsed.error);
    expect(parsed.doc.toJS()).toMatchObject({ m: { x: 1, y: '<<' } });
  });

  it('writes the first entry of an empty {} or [] as a block', () => {
    const text = edited('inputs: {}\nlist: []\n', (doc) => {
      writeAt(doc, ['inputs', 'seed'], 'number');
      writeAt(doc, ['list', 0], 'first');
    });

    expect(text).toBe('inputs:\n  seed: number\nlist:\n  - first\n');
  });

  it('reads a number only where PyYAML does', () => {
    const parsed = parseYaml(
      'a: 09\nb: +.5\nc: .\nd: 1e3\ne: 10\nf: 0.5\ng: 1_000\nh: 1.0e+3\n',
    );
    if ('error' in parsed) throw new Error(parsed.error);

    expect(parsed.doc.toJS()).toEqual({
      a: '09',
      b: '+.5',
      c: '.',
      d: '1e3',
      e: 10,
      f: 0.5,
      g: 1000,
      h: 1000,
    });
  });

  it('changes a mapping already there key by key, keeping its comments and order', () => {
    const text = edited(
      'time_ms:\n  from: x # CPU time\n  fold: max\n  better: lower\n',
      (doc) => writeAt(doc, ['time_ms'], { from: 'x', fold: 'sum', at_least: 0 }),
    );

    expect(text).toBe('time_ms:\n  from: x # CPU time\n  fold: sum\n  at_least: 0\n');
  });
});
