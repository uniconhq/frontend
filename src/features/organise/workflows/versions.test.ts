import { describe, expect, it } from 'vitest';
import { nextVersion, versionNumber } from './versions';

describe('workflow version names', () => {
  it('reads the number of v and a whole number, and none of any other name', () => {
    expect(versionNumber('v1')).toBe(1);
    expect(versionNumber('v10')).toBe(10);
    for (const other of ['v0', 'v01', 'V2', '2', 'v2.1', 'beta', ''])
      expect(versionNumber(other)).toBeNull();
  });

  it('offers the number after the highest, passing over other names', () => {
    expect(nextVersion([])).toBe('v1');
    expect(nextVersion(['beta'])).toBe('v1');
    expect(nextVersion(['v1', 'v9', 'beta'])).toBe('v10');
    expect(nextVersion(['v10', 'v2'])).toBe('v11');
  });
});
