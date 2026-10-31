import { describe, expect, it } from 'vitest';
import { PRIMITIVES } from '@/test/workflows';
import { readWorkflow } from './model';
import { byRef, declared } from './primitives';

const primitives = byRef(PRIMITIVES);

/** The one step of a workflow that uses `use` with `given`. */
function stepOf(use: string, given: Record<string, unknown>) {
  const [step] = readWorkflow({ steps: [{ id: 'game', use, with: given }] }).steps;
  if (step === undefined) throw new Error('the step is read');
  return step;
}

describe('a primitive as a step declares it', () => {
  it('is its own declaration when it has no forms', () => {
    const step = stepOf('unicon/diff-check@v2', {});
    expect(declared(primitives, step)).toBe(primitives.get('unicon/diff-check@v2'));
  });

  it('is nothing for a version the platform no longer reads', () => {
    expect(declared(primitives, stepOf('unicon/exec@v1', {}))).toBeNull();
  });

  it('is the first form whose inputs hold every port the step gives', () => {
    const one = declared(
      primitives,
      stepOf('unicon/exec@v2', {
        source: 'a',
        language: 'c',
        stdin: 'b',
        time_limit: 1,
        memory_limit: 256,
      }),
    );
    expect(Object.keys(one?.inputs ?? {})).toEqual([
      'source',
      'language',
      'entry',
      'stdin',
      'files',
      'loads',
      'manifest',
      'self_reported',
      'args',
      'time_limit',
      'memory_limit',
    ]);
    expect(Object.keys(one?.outputs ?? {})).toEqual([
      'output',
      'time_ms',
      'memory_kb',
      'label',
      'message',
      'staff_message',
      'extras',
      'log',
      'outcome',
    ]);
    expect(one?.description).toBe(
      'Compiles a program once, runs it under limits and records its output, time and memory.',
    );
  });

  it('is the first form for a new step, a half-wired one, or one given only what compiles a program', () => {
    const one = primitives.get('unicon/exec@v2')?.forms.one;
    for (const given of [
      {},
      { source: 'a', time_limit: 1 },
      { source: 'a', language: 'c' },
    ]) {
      const drawn = declared(primitives, stepOf('unicon/exec@v2', given));
      expect(drawn?.inputs).toBe(one?.inputs);
      expect(drawn?.outputs).toEqual(one?.outputs);
    }
  });

  it('gives each program of a programs form its outputs, by the name the step gives it', () => {
    const programs = declared(
      primitives,
      stepOf('unicon/exec@v2', {
        programs: {
          entrant: { source: 'a', language: 'c', time_limit: 1 },
          judge: { source: 'b', language: 'python', time_limit: 2 },
        },
      }),
    );
    expect(Object.keys(programs?.outputs ?? {})).toEqual([
      'facts',
      'outcome',
      ...['entrant', 'judge'].flatMap((program) =>
        [
          'time_ms',
          'memory_kb',
          'ended',
          'signal',
          'ended_at',
          'stopped_by',
          'log',
        ].map((output) => `${program}.${output}`),
      ),
    ]);
  });

  it('has no ports when no one form holds every port the step gives', () => {
    const none = declared(
      primitives,
      stepOf('unicon/exec@v2', { source: 'a', language: 'c', programs: {} }),
    );
    expect(none?.inputs).toEqual({});
    expect(none?.outputs).toEqual({});
  });
});
