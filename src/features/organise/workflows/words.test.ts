import { describe, expect, it } from 'vitest';
import { PRIMITIVES } from '@/test/workflows';
import { readWorkflow } from './model';
import { byRef, declared, type PrimitiveInfo } from './primitives';
import { outcomeWords } from './words';

/** A step of exec given a source and its language: drawn as its one form. */
const [RUN_STEP] = readWorkflow({
  steps: [{ id: 'run', use: 'unicon/exec@v2', with: { source: 'a', language: 'c' } }],
}).steps;

/** exec's one form with its outcome port holding `outcomes`. */
function withOutcomes(outcomes: Record<string, string> | null): PrimitiveInfo {
  const run = RUN_STEP && declared(byRef(PRIMITIVES), RUN_STEP);
  if (!run) throw new Error('exec is in the fixtures');
  const outcome = run.outputs.outcome;
  if (outcome === undefined) throw new Error('the one form reports an outcome');
  return {
    ...run,
    outputs: { ...run.outputs, outcome: { ...outcome, outcomes } },
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
    expect(outcomeWords(withOutcomes(null))).toBe(
      "How the program's run ended, or that its source did not compile.",
    );
    expect(outcomeWords({ ...withOutcomes(null), outputs: {} })).toBeNull();
  });
});
