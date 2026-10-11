import { describe, expect, it } from 'vitest';
import { teamNameProblem } from './team-fields';

describe('teamNameProblem', () => {
  it('counts characters as the forge does, not UTF-16 code units', () => {
    expect(teamNameProblem('🚀'.repeat(60))).toBeNull();
    expect(teamNameProblem('🚀'.repeat(61))).toBe(
      'A team’s name is at most 60 characters.',
    );
  });

  it('checks the name once trimmed, and refuses an empty one', () => {
    expect(teamNameProblem(`  ${'a'.repeat(60)}  `)).toBeNull();
    expect(teamNameProblem('   ')).toBe('A team needs a name.');
  });
});
