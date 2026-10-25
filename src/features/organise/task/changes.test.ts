import { describe, expect, it } from 'vitest';
import type { GroupValues, TaskValues } from '../forms/task-values';
import { changeLines } from './changes';
import { NOTHING_STAGED } from './staged';

function group(overrides: Partial<GroupValues> = {}): GroupValues {
  return {
    name: 'main',
    read: true,
    folder: true,
    each: '',
    worst: '',
    pass: '',
    passAt: '',
    weights: [],
    show: '',
    ...overrides,
  };
}

function task(groups: GroupValues[]): TaskValues {
  return {
    name: 'Sum',
    workflow: 'unicon/classic@v1',
    inputs: [],
    axes: [],
    groups,
    max: '',
    rateCount: '',
    ratePer: '',
  };
}

const lines = (was: GroupValues, now: GroupValues) =>
  changeLines(task([was]), task([now]), NOTHING_STAGED, new Map());

describe('what a save changes in a test group', () => {
  it('says only its points when its total alone changes, the rule the same', () => {
    expect(lines(group({ pass: '100' }), group({ pass: '110' }))).toEqual([
      'main: points',
    ]);
    expect(
      lines(
        group({ each: '60', pass: '40', passAt: '0.8' }),
        group({ each: '90', pass: '60', passAt: '0.8' }),
      ),
    ).toEqual(['main: points']);
  });

  it('says how it earns points when the rule’s shape changes', () => {
    expect(lines(group({ pass: '100' }), group({ each: '100' }))).toEqual([
      'main: how it earns points',
    ]);
    expect(
      lines(group({ each: '50', pass: '50' }), group({ each: '30', pass: '70' })),
    ).toEqual(['main: how it earns points']);
    expect(
      lines(
        group({ pass: '100', passAt: '0.5' }),
        group({ pass: '100', passAt: '0.8' }),
      ),
    ).toEqual(['main: how it earns points']);
  });

  it('says both when the shape and the total change together, and nothing when only spelled differently', () => {
    expect(lines(group({ pass: '100' }), group({ each: '120' }))).toEqual([
      'main: points',
      'main: how it earns points',
    ]);
    expect(lines(group({ pass: '100' }), group({ pass: '100.0' }))).toEqual([]);
  });

  it('says nothing when the share of tests that must pass is written out as all of them, as it was unset', () => {
    expect(lines(group({ pass: '100' }), group({ pass: '100', passAt: '1' }))).toEqual(
      [],
    );
    expect(lines(group({ pass: '100', passAt: '1' }), group({ pass: '100' }))).toEqual(
      [],
    );
  });
});
