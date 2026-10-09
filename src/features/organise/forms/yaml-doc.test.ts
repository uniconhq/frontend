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
