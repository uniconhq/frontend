import { describe, expect, it } from 'vitest';
import { latestVersion, nextVersion, versionNumber } from './versions';

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

  it('takes the highest number as the latest, whatever else is tagged', () => {
    expect(latestVersion(['beta', 'v1', 'v9', 'v10', 'zeta'])).toBe('v10');
    expect(latestVersion(['v2', 'v10', 'w'])).toBe('v10');
    expect(latestVersion(['beta', 'zeta'])).toBe('zeta');
    expect(latestVersion([])).toBeUndefined();
  });
});
