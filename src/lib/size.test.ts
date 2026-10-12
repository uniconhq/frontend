import { describe, expect, it } from 'vitest';
import { formatLimit, formatSize } from './size';

describe('a size as a person reads it', () => {
  it('is in B below a kilobyte, then in the largest unit to one decimal', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(1)).toBe('1 B');
    expect(formatSize(1023)).toBe('1023 B');
    expect(formatSize(1024)).toBe('1 KB');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(314_572_800)).toBe('300 MB');
    expect(formatSize(3 * 1024 ** 3 + 1024 ** 3 / 4)).toBe('3.3 GB');
  });
});

describe('a size as a limit is written', () => {
  it('is in whole MB or KB when it is one, else in B, as a size is', () => {
    expect(formatLimit(4)).toBe('4 B');
    expect(formatLimit(2048)).toBe('2 KB');
    expect(formatLimit(10 * 1024 * 1024)).toBe('10 MB');
  });
});
