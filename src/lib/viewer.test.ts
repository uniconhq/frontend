import { describe, expect, it } from 'vitest';
import type { Me } from '@/api/types';
import { contestStaff } from './viewer';

const ORG = 'acme';
const CONTEST = 'spring';

function role(
  held: 'admin' | 'manager' | 'observer',
  names: { org: string; contest: string | null; task: string | null },
): Me['roles'][number] {
  return { role: held, names };
}

function staff(roles: Me['roles']) {
  return contestStaff(ORG, CONTEST, roles);
}

describe('contestStaff', () => {
  it('is no one with no role', () => {
    expect(staff([])).toBe(false);
  });

  it('counts a role at the org or at the contest', () => {
    expect(staff([role('admin', { org: ORG, contest: null, task: null })])).toBe(true);
    expect(staff([role('observer', { org: ORG, contest: CONTEST, task: null })])).toBe(
      true,
    );
  });

  it('does not count a role at one task alone', () => {
    expect(staff([role('manager', { org: ORG, contest: CONTEST, task: 'sum' })])).toBe(
      false,
    );
  });

  it('does not count a role at another contest or org', () => {
    expect(staff([role('admin', { org: ORG, contest: 'other', task: null })])).toBe(
      false,
    );
    expect(staff([role('admin', { org: 'globex', contest: null, task: null })])).toBe(
      false,
    );
  });
});
