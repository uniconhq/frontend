import { describe, expect, it } from 'vitest';
import { PRIMITIVES } from '@/test/workflows';
import type { PrimitiveInfo } from './primitives';
import { outcomeWords } from './words';

const COMPILE = PRIMITIVES.find((found) => found.ref === 'unicon/compile@v3');

/** Compile with its outcome port holding `outcomes`. */
function withOutcomes(outcomes: Record<string, string> | null): PrimitiveInfo {
  if (COMPILE === undefined) throw new Error('compile is in the fixtures');
  const outcome = COMPILE.outputs.outcome;
  if (outcome === undefined) throw new Error('compile reports an outcome');
  return {
    ...COMPILE,
    outputs: { ...COMPILE.outputs, outcome: { ...outcome, outcomes } },
  };
}

describe('the result a step reports, in the primitive’s words (M56)', () => {
  it('says one outcome with when it is reported', () => {
    expect(outcomeWords(withOutcomes({ accepted: 'the program ran' }))).toBe(
      'Accepted if the program ran.',
    );
  });

  it('says two as one sentence, the second all the first is not', () => {
    expect(
      outcomeWords(withOutcomes({ accepted: 'it matches', wrong_answer: 'not' })),
    ).toBe('Accepted if it matches, otherwise Wrong answer.');
  });

  it('says more as a line each', () => {
    expect(
      outcomeWords(
        withOutcomes({
          accepted: 'it ends in time',
          time_limit: 'it runs out of time',
          runtime_error: 'it crashes',
        }),
      ),
    ).toEqual([
      'Accepted if it ends in time',
      'Time limit if it runs out of time',
      'Runtime error if it crashes',
    ]);
  });

  it('falls back to the port’s own sentence where the primitive says no outcome', () => {
    expect(outcomeWords(withOutcomes(null))).toBe('Whether the source compiled.');
    expect(outcomeWords({ ...withOutcomes(null), outputs: {} })).toBeNull();
  });
});
