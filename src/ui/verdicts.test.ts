import { describe, expect, it } from 'vitest';
import { lookOf } from './verdicts';

describe('a verdict’s colours', () => {
  it('never shows a finished grading like one still waiting', () => {
    const waiting = ['queued', 'dispatched', 'submitted'].map(
      (status) => lookOf(status).colors,
    );
    for (const finished of ['graded', 'done']) {
      expect(lookOf(finished).colors).toBe('finished');
      expect(waiting).not.toContain(lookOf(finished).colors);
    }
    expect(new Set(waiting)).toEqual(new Set(['queued']));
  });

  it('shows one held up or ended without a result as a warning', () => {
    for (const trouble of ['delayed', 'cancelled', 'over_limit']) {
      expect(lookOf(trouble).colors, trouble).toBe('limit');
    }
  });
});
