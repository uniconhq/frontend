import { describe, expect, it } from 'vitest';
import {
  NumberText,
  parseYaml,
  textAt,
  writeAt,
  writeOver,
  writeYaml,
  type Doc,
} from './yaml-doc';

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

  it('reads no, NO and on as text, as YAML 1.2 does', () => {
    const parsed = parseYaml('test_groups:\n  no: {each: 1}\n  NO: {}\nflag: on\n');
    if ('error' in parsed) throw new Error(parsed.error);

    expect(parsed.doc.toJS()).toEqual({
      test_groups: { no: { each: 1 }, NO: {} },
      flag: 'on',
    });
  });

  it('reads a file as YAML 1.2 whatever %YAML line it carries', () => {
    const parsed = parseYaml('%YAML 1.1\n---\ncountry: NO\nlate: yes\n');
    if ('error' in parsed) throw new Error(parsed.error);

    expect(parsed.doc.toJS()).toEqual({ country: 'NO', late: 'yes' });
  });

  it('writes plain what only 1.1 would read as true, false or a number', () => {
    const text = edited('a: 1\n', (doc) => {
      writeAt(doc, ['flag'], 'on');
      writeAt(doc, ['size'], '1_000');
      writeAt(doc, ['letter'], 'y');
      writeAt(doc, ['group'], 'no');
    });

    expect(text).toBe('a: 1\nflag: on\nsize: 1_000\nletter: y\ngroup: no\n');
  });

  it('quotes text that 1.2 reads as true, false, a number or nothing', () => {
    const text = edited('a: 1\n', (doc) => {
      writeAt(doc, ['flag'], 'true');
      writeAt(doc, ['size'], '12');
      writeAt(doc, ['hex'], '0x1F');
      writeAt(doc, ['none'], 'null');
    });

    expect(text).toBe('a: 1\nflag: "true"\nsize: "12"\nhex: "0x1F"\nnone: "null"\n');
  });
});

describe('the scalars as YAML 1.2 reads them', () => {
  it('writes a date and = plain, as text', () => {
    const text = edited('a: 1\n', (doc) => {
      writeAt(doc, ['day'], '2026-10-09');
      writeAt(doc, ['eq'], '=');
      writeAt(doc, ['list'], ['2026-10-09', 'later']);
    });

    expect(text).toBe('a: 1\nday: 2026-10-09\neq: =\nlist: [2026-10-09, later]\n');
    const parsed = parseYaml(text);
    if ('error' in parsed) throw new Error(parsed.error);
    expect(parsed.doc.toJS()).toEqual({
      a: 1,
      day: '2026-10-09',
      eq: '=',
      list: ['2026-10-09', 'later'],
    });
  });

  it('reads << as a key like any other and keeps a time as written', () => {
    const text = edited(
      'base: &b {x: 1}\nm:\n  <<: *b\n  y: 2\ndue: 2026-06-01T09:00:00Z\n',
      (doc) => {
        writeAt(doc, ['due'], '2026-06-02T09:00:00Z');
      },
    );

    expect(text).toBe(
      'base: &b {x: 1}\nm:\n  <<: *b\n  y: 2\ndue: 2026-06-02T09:00:00Z\n',
    );
    const parsed = parseYaml(text);
    if ('error' in parsed) throw new Error(parsed.error);
    expect(parsed.doc.toJS()).toMatchObject({ m: { '<<': { x: 1 }, y: 2 } });
  });

  it('writes a time plain over text, a number or nothing', () => {
    const text = edited('a: hello # kept\nb: 5\nc:\nd: "x"\n', (doc) => {
      writeAt(doc, ['a'], '2026-01-01');
      writeAt(doc, ['b'], '2026-01-01');
      writeAt(doc, ['c'], '2026-01-01T09:00:00Z');
    });

    expect(text).toBe(
      'a: 2026-01-01 # kept\nb: 2026-01-01\nc: 2026-01-01T09:00:00Z\nd: "x"\n',
    );
  });

  it('writes a number typed into a field as its digits, all thirty of them', () => {
    const digits = '123456789012345.678901234567891';
    const text = edited('worth: 100\n', (doc) => {
      writeAt(doc, ['worth'], new NumberText('100.50'));
      writeAt(doc, ['bound'], new NumberText(digits));
      writeAt(doc, ['tiny'], new NumberText('1e-9'));
    });

    expect(text).toBe(`worth: 100.50\nbound: ${digits}\ntiny: 1e-9\n`);
    const parsed = parseYaml(text);
    if ('error' in parsed) throw new Error(parsed.error);
    expect(textAt(parsed.doc, ['bound'])).toBe(digits);
    expect(textAt(parsed.doc, ['worth'])).toBe('100.50');
  });

  it('keeps every digit of a number it did not change, and sees a change to the last', () => {
    const digits = '0.123456789012345678901234567891';
    const file = `bound: ${digits} # thirty digits\nname: x\n`;
    const parsed = parseYaml(file);
    if ('error' in parsed) throw new Error(parsed.error);
    writeAt(parsed.doc, ['name'], 'y');

    expect(writeOver(file, parsed.doc)).toBe(
      `bound: ${digits} # thirty digits\nname: y\n`,
    );
    writeAt(parsed.doc, ['bound'], new NumberText(digits.replace(/1$/, '2')));
    expect(writeOver(file, parsed.doc)).toBe(
      `bound: ${digits.replace(/1$/, '2')} # thirty digits\nname: y\n`,
    );
  });

  it('writes a mapping over one whose keys are numbers as text keys', () => {
    const text = edited('test_weights: {1: 2, 2: 3}\n', (doc) => {
      writeAt(doc, ['test_weights'], { '1': 5 });
    });

    expect(text).toBe('test_weights: {"1": 5}\n');
  });

  it('keeps the comment of a mapping a plain value replaces', () => {
    const text = edited(
      'seed: {type: number, optional: true} # random seed\n',
      (doc) => {
        writeAt(doc, ['seed'], 'number');
      },
    );

    expect(text).toBe('seed: number # random seed\n');
  });

  it('writes a new key that looks like a date plain, and escapes a break', () => {
    const text = edited('test_groups: {}\n', (doc) => {
      writeAt(doc, ['test_groups', '2024-01-01'], { weight: 1 });
      writeAt(doc, ['note'], 'a\u0085b c');
    });

    expect(text).toBe('test_groups:\n  2024-01-01: {weight: 1}\nnote: "a\\Nb\\Lc"\n');
    const parsed = parseYaml(text);
    if ('error' in parsed) throw new Error(parsed.error);
    expect(parsed.doc.toJS()).toEqual({
      test_groups: { '2024-01-01': { weight: 1 } },
      note: 'a\u0085b c',
    });
  });

  it('double-quotes and escapes a tab and the characters PyYAML takes only escaped', () => {
    const text = edited('a: 1\n', (doc) => {
      writeAt(doc, ['args'], '--seed\t${{ inputs.seed }}');
      writeAt(doc, ['odd'], 'a\u007fb\u0090c\u0001d￾');
    });

    expect(text).toBe(
      'a: 1\nargs: "--seed\\t${{ inputs.seed }}"\nodd: "a\\x7Fb\\x90c\\x01d\\uFFFE"\n',
    );
    const parsed = parseYaml(text);
    if ('error' in parsed) throw new Error(parsed.error);
    expect(parsed.doc.toJS()).toMatchObject({
      args: '--seed\t${{ inputs.seed }}',
      odd: 'a\u007fb\u0090c\u0001d￾',
    });
  });

  it('reads an alias with no anchor as a file it cannot read', () => {
    const parsed = parseYaml('steps:\n  - with: {actual: *x}\n');

    expect(parsed).toHaveProperty('error');
  });

  it('writes the first entry of an empty {} or [] as a block', () => {
    const text = edited('inputs: {}\nlist: []\n', (doc) => {
      writeAt(doc, ['inputs', 'seed'], 'number');
      writeAt(doc, ['list', 0], 'first');
    });

    expect(text).toBe('inputs:\n  seed: number\nlist:\n  - first\n');
  });

  it('reads a number only where YAML 1.2 does', () => {
    const parsed = parseYaml(
      'a: 09\nb: +.5\nc: .\nd: 1e3\ne: 10\nf: 0.5\ng: 1_000\nh: 1.0e+3\ni: 1:30\n',
    );
    if ('error' in parsed) throw new Error(parsed.error);

    expect(parsed.doc.toJS()).toEqual({
      a: 9,
      b: 0.5,
      c: '.',
      d: 1000,
      e: 10,
      f: 0.5,
      g: '1_000',
      h: 1000,
      i: '1:30',
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
