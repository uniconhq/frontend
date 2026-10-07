import { describe, expect, it } from 'vitest';
import { formatSize } from './size';

describe('a size as a person reads it', () => {
  it('is in bytes below a kilobyte, then in the largest unit to one decimal', () => {
    expect(formatSize(0)).toBe('0 bytes');
    expect(formatSize(1)).toBe('1 byte');
    expect(formatSize(1023)).toBe('1023 bytes');
    expect(formatSize(1024)).toBe('1 KB');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(314_572_800)).toBe('300 MB');
    expect(formatSize(3 * 1024 ** 3 + 1024 ** 3 / 4)).toBe('3.3 GB');
  });
});
