import { describe, expect, it } from 'vitest';
import { keepEqual } from './keep-equal';

describe('keeping what did not change', () => {
  it('gives the value before when the two are equal all through', () => {
    const before = { name: 'run', rows: [{ port: 'args', said: 'text' }], marks: [] };
    const after = { name: 'run', rows: [{ port: 'args', said: 'text' }], marks: [] };
    expect(keepEqual(before, after)).toBe(before);
  });

  it('keeps each part that did not change and gives the new one of each that did', () => {
    const before = {
      name: 'run',
      rows: [
        { port: 'args', said: 'text' },
        { port: 'input', said: 'file' },
      ],
    };
    const after = {
      name: 'run',
      rows: [
        { port: 'args', said: 'text · = "x"' },
        { port: 'input', said: 'file' },
      ],
    };
    const kept = keepEqual(before, after);
    expect(kept).toEqual(after);
    expect(kept).not.toBe(before);
    expect(kept.rows).not.toBe(before.rows);
    expect(kept.rows[0]).toBe(after.rows[0]);
    expect(kept.rows[1]).toBe(before.rows[1]);
  });

  it('sees a part added, taken away or turned into another kind', () => {
    expect(keepEqual({ a: 1 }, { a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    const fewer = { a: 1 };
    expect(keepEqual({ a: 1, b: 2 }, fewer)).toEqual({ a: 1 });
    expect(keepEqual({ a: 1, b: undefined }, { a: 1, c: undefined })).toEqual({
      a: 1,
      c: undefined,
    });
    expect(keepEqual([1, 2], [1, 2, 3])).toEqual([1, 2, 3]);
    expect(keepEqual([1, 2, 3], [1, 2])).toEqual([1, 2]);
    const list = [1];
    expect(keepEqual({ 0: 1 }, list)).toBe(list);
    expect(keepEqual(null, { a: 1 })).toEqual({ a: 1 });
  });

  it('looks into nothing but plain objects and arrays', () => {
    class Text {
      readonly text: string;
      constructor(text: string) {
        this.text = text;
      }
    }
    const after = { value: new Text('1.50') };
    const kept = keepEqual({ value: new Text('1.50') }, after);
    expect(kept).toBe(after);
    const map = new Map([['a', 1]]);
    expect(keepEqual(new Map([['a', 1]]), map)).toBe(map);
  });
});
