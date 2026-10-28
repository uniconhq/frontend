import { describe, expect, it } from 'vitest';
import { FORMED, PRIMITIVES } from '@/test/workflows';
import { readWorkflow } from './model';
import { byRef, declared } from './primitives';

const primitives = byRef([...PRIMITIVES, FORMED]);

/** The one step of a workflow that uses `use` with `given`. */
function stepOf(use: string, given: Record<string, unknown>) {
  const [step] = readWorkflow({ steps: [{ id: 'game', use, with: given }] }).steps;
  if (step === undefined) throw new Error('the step is read');
  return step;
}

describe('a primitive as a step declares it', () => {
  it('is its own declaration when it has no forms', () => {
    const step = stepOf('unicon/compile@v3', {});
    expect(declared(primitives, step)).toBe(primitives.get('unicon/compile@v3'));
  });

  it('is the one form the step’s ports fit, as the forge picks it', () => {
    const one = declared(
      primitives,
      stepOf('unicon/exec@v2', { program: 'a', time_limit: 1 }),
    );
    expect(Object.keys(one?.inputs ?? {})).toEqual(['program', 'stdin', 'time_limit']);
    expect(Object.keys(one?.outputs ?? {})).toEqual(['output', 'time_ms', 'outcome']);
    expect(one?.description).toBe('Runs a program once under limits.');
  });

  it('gives each program of a programs form its outputs, by the name the step gives it', () => {
    const programs = declared(
      primitives,
      stepOf('unicon/exec@v2', {
        programs: {
          entrant: { program: 'a', time_limit: 1 },
          judge: { program: 'b', time_limit: 2 },
        },
      }),
    );
    expect(Object.keys(programs?.outputs ?? {})).toEqual([
      'facts',
      'outcome',
      'entrant.time_ms',
      'entrant.memory_kb',
      'judge.time_ms',
      'judge.memory_kb',
    ]);
  });

  it('has no ports when the step’s ports fit no form, or more than one', () => {
    for (const given of [{}, { program: 'a', programs: {} }]) {
      const none = declared(primitives, stepOf('unicon/exec@v2', given));
      expect(none?.inputs).toEqual({});
      expect(none?.outputs).toEqual({});
    }
  });
});
