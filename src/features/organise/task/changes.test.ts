import { describe, expect, it } from 'vitest';
import { emptyInput, emptyTuple, type TaskValues } from '../forms/task-values';
import { changeLines } from './changes';

function task(overrides: Partial<TaskValues> = {}): TaskValues {
  return {
    name: 'Sum',
    workflow: 'unicon/classic@v4',
    inputs: [],
    axes: [],
    scoreGroups: [],
    scoreValues: [],
    show: {},
    checks: [],
    max: '',
    rateCount: '',
    ratePer: '',
    ...overrides,
  };
}

const TITLES = new Map([['time_limit', 'Time limit']]);

describe('what a save of the task’s cards changes', () => {
  it('says nothing when nothing changed', () => {
    expect(changeLines(task(), task(), TITLES)).toEqual([]);
  });

  it('names each input by its title, and one given a new file once as such', () => {
    const was = task({
      inputs: [{ ...emptyInput('time_limit', 'value'), value: '1' }],
    });
    const now = task({
      inputs: [{ ...emptyInput('time_limit', 'value'), value: '2' }],
    });
    expect(changeLines(was, now, TITLES)).toEqual(['Inputs: Time limit']);
    expect(changeLines(was, now, TITLES, ['time_limit'])).toEqual([
      'Inputs: Time limit, a new file',
    ]);
    expect(changeLines(was, task(), TITLES)).toEqual(['Inputs: Time limit removed']);
  });

  it('says the runs, the scoring, the checks and the submission rules, each once', () => {
    const now = task({
      axes: [{ inputs: ['input'], tuples: [emptyTuple(['input'])] }],
      show: { score: 'now' },
      checks: [],
      max: '10',
    });
    expect(changeLines(task(), now, TITLES)).toEqual([
      'Runs',
      'Scoring',
      'Submission rules',
    ]);
  });
});
