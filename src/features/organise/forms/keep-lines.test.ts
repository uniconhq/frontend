import { describe, expect, it } from 'vitest';
import { setInput } from '../workflows/edit';
import { parseYaml, writeAt, writeOver } from './yaml-doc';

const HAND_WRITTEN = [
  'inputs:  # the inputs',
  '  seed: number',
  'test:  # the fields',
  '  input: file',
  'steps:',
  '  - id: a  # step a',
  '    use: unicon/compile@v2',
  '    with: {}',
  'report: {} # none yet',
  '',
].join('\n');

function over(
  text: string,
  edit: (doc: Parameters<typeof writeOver>[1]) => void,
): string {
  const parsed = parseYaml(text);
  if ('error' in parsed) throw new Error(parsed.error);
  edit(parsed.doc);
  return writeOver(text, parsed.doc);
}

describe('an edit laid over the file', () => {
  it('changes only the lines it reaches', () => {
    const added = setInput(HAND_WRITTEN, 'extra', { type: 'number' });

    expect(added).toBe(
      HAND_WRITTEN.replace('  seed: number\n', '  seed: number\n  extra: number\n'),
    );
  });

  it('keeps every line when nothing changed', () => {
    expect(over(HAND_WRITTEN, () => undefined)).toBe(HAND_WRITTEN);
  });

  it('writes a line beside the edit as the library does, and the rest as they were', () => {
    const text = over(HAND_WRITTEN, (doc) => writeAt(doc, ['report', 'time_ms'], 'x'));

    expect(
      text.startsWith(HAND_WRITTEN.slice(0, HAND_WRITTEN.indexOf('report:'))),
    ).toBe(true);
    const parsed = parseYaml(text);
    if ('error' in parsed) throw new Error(parsed.error);
    expect(parsed.doc.toJS()).toMatchObject({ report: { time_ms: 'x' } });
    expect(text).toContain('# none yet');
  });

  it('writes the whole file as the library does when keeping lines would change it', () => {
    const wide = 'a:\n    b: 1\n    c: 2\nd: 3\n';

    const text = over(wide, (doc) => writeAt(doc, ['a', 'e'], 4));

    const parsed = parseYaml(text);
    if ('error' in parsed) throw new Error(parsed.error);
    expect(parsed.doc.toJS()).toEqual({ a: { b: 1, c: 2, e: 4 }, d: 3 });
  });
});
