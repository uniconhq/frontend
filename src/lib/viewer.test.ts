import { describe, expect, it } from 'vitest';
import type { Me } from '@/api/types';
import { viewerOf } from './viewer';

const ORG = 'acme';
const CONTEST = 'spring';
const TASK = 'sum';

function role(
  held: 'admin' | 'manager' | 'observer',
  names: { org: string; contest: string | null; task: string | null },
): Me['roles'][number] {
  return { role: held, names };
}

function entry(status: 'approved' | 'pending') {
  return { entrant: { status } };
}

function seen(
  roles: Me['roles'],
  mine: { entrant: { status: string } | null } | null,
  task = TASK,
) {
  return viewerOf(ORG, CONTEST, task, roles, mine);
}

describe('viewerOf', () => {
  it('is none of them with no role and no entrant', () => {
    expect(seen([], null)).toEqual({
      approvedEntrant: false,
      contestStaff: false,
      taskObserver: false,
      taskManager: false,
    });
  });

  it('is an approved entrant only once the entrant is approved', () => {
    expect(seen([], entry('pending')).approvedEntrant).toBe(false);
    expect(seen([], entry('approved')).approvedEntrant).toBe(true);
  });

  it('counts an org admin as staff, an observer and a manager of the task', () => {
    expect(
      seen([role('admin', { org: ORG, contest: null, task: null })], null),
    ).toEqual({
      approvedEntrant: false,
      contestStaff: true,
      taskObserver: true,
      taskManager: true,
    });
  });

  it('counts a contest observer as staff and an observer, not a manager', () => {
    const view = seen(
      [role('observer', { org: ORG, contest: CONTEST, task: null })],
      null,
    );
    expect(view.contestStaff).toBe(true);
    expect(view.taskObserver).toBe(true);
    expect(view.taskManager).toBe(false);
  });

  it('counts a manager of this task, and not of another', () => {
    const held = [role('manager', { org: ORG, contest: CONTEST, task: TASK })];
    expect(seen(held, null).taskManager).toBe(true);
    expect(seen(held, null, 'other').taskManager).toBe(false);
    expect(seen(held, null, 'other').taskObserver).toBe(false);
    expect(seen(held, null, 'other').contestStaff).toBe(true);
  });

  it('does not count a role at another contest', () => {
    const view = seen(
      [role('admin', { org: ORG, contest: 'other', task: null })],
      null,
    );
    expect(view.contestStaff).toBe(false);
    expect(view.taskObserver).toBe(false);
  });
});
