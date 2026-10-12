import { describe, expect, it } from 'vitest';
import { inputTitle } from './build-data';

describe('an input as the task’s form names it', () => {
  it('puts a unit after the title of a number alone (M54)', () => {
    expect(
      inputTitle({
        id: 'time_limit',
        title: 'Time limit',
        unit: 'seconds',
        type: 'number',
      }),
    ).toBe('Time limit (seconds)');
    // A version made before units were for numbers only may still hold one.
    expect(
      inputTitle({ id: 'checker', title: 'Checker', unit: 'seconds', type: 'file' }),
    ).toBe('Checker');
    expect(inputTitle({ id: 'level', title: null, unit: 'steps', type: 'enum' })).toBe(
      'level',
    );
  });
});
