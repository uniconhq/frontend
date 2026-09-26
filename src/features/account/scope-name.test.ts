import { describe, expect, it } from 'vitest';
import { scopeName } from './scope-name';

describe('scopeName', () => {
  it('names an org by itself', () => {
    expect(scopeName({ kind: 'org', org: 'acme', contest: null, task: null })).toBe(
      'acme',
    );
  });

  it('walks down to the contest and the task', () => {
    expect(
      scopeName({ kind: 'contest', org: 'acme', contest: 'spring', task: null }),
    ).toBe('acme/spring');
    expect(
      scopeName({ kind: 'task', org: 'acme', contest: 'spring', task: 'sorting' }),
    ).toBe('acme/spring/sorting');
  });
});
