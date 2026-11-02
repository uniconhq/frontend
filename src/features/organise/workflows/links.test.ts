import { describe, expect, it } from 'vitest';
import { linkRoles } from './links';

describe('link ends', () => {
  it('counts first input and output independently', () => {
    expect(linkRoles(['a', 'b', 'c'], ['a -> b', 'a -> c', 'b -> c'])).toEqual([
      { writer: 'a', reader: 'b', out: 'prints', into: 'reads' },
      { writer: 'a', reader: 'c', out: 'to_c', into: 'reads' },
      { writer: 'b', reader: 'c', out: 'prints', into: 'from_b' },
    ]);
  });
  it('relabels after reordering and skips unfinished links', () => {
    expect(
      linkRoles(['a', 'b', 'c'], ['unfinished', 'b -> c', 'a -> c', 'a -> b']),
    ).toEqual([
      null,
      { writer: 'b', reader: 'c', out: 'prints', into: 'reads' },
      { writer: 'a', reader: 'c', out: 'prints', into: 'from_a' },
      { writer: 'a', reader: 'b', out: 'to_b', into: 'reads' },
    ]);
  });
});
