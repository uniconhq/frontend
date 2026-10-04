import { describe, expect, it } from 'vitest';
import { scopeName } from './scope-name';

describe('scopeName', () => {
  it('names an org by itself', () => {
    expect(scopeName({ org: 'acme', contest: null, task: null })).toBe('acme');
  });

  it('walks down to the contest and the task', () => {
    expect(scopeName({ org: 'acme', contest: 'spring', task: null })).toBe(
      'acme/spring',
    );
    expect(scopeName({ org: 'acme', contest: 'spring', task: 'sorting' })).toBe(
      'acme/spring/sorting',
    );
  });
});
