import { describe, expect, it } from 'vitest';
import { listed } from './listed';

describe('words said as a list', () => {
  it('joins the last two with "and" and the rest with commas', () => {
    expect(listed([])).toBe('');
    expect(listed(['input'])).toBe('input');
    expect(listed(['input', 'answer'])).toBe('input and answer');
    expect(listed(['input', 'answer', 'checker'])).toBe('input, answer and checker');
  });
});
