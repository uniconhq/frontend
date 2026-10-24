import type { Me } from '@/api/types';

/**
 * Who the caller is at one contest and one task, worked out in the browser
 * from `/me` and the contest's registration panel (`C/home`'s `registration`,
 * which is what `C/entrants/mine` answers). The backend checks every action
 * again.
 *
 * A role at an org covers its contests and their tasks, and a role at a
 * contest covers its tasks. Admin outranks manager, which outranks observer.
 * Staff of the contest is any role at the org, the contest, or one of its
 * tasks, which is what the home's `organises` says.
 */

type Roles = Me['roles'];

const RANK = { admin: 3, manager: 2, observer: 1 } as const;

type Least = keyof typeof RANK;

function rankOf(role: string): number {
  return Object.hasOwn(RANK, role) ? RANK[role as Least] : 0;
}

function covers(
  roles: Roles,
  org: string,
  contest: string,
  task: string | null,
  least: Least,
): boolean {
  return roles.some(({ names, role }) => {
    if (names.org !== org || rankOf(role) < RANK[least]) return false;
    if (names.contest !== null && names.contest !== contest) return false;
    if (task !== null && names.task !== null && names.task !== task) return false;
    return true;
  });
}

export type Viewer = {
  /** In an approved entrant of the contest. */
  approvedEntrant: boolean;
  /** Holds a role at the contest, counting the org and any of its tasks. */
  contestStaff: boolean;
  /** At least an observer of the task, counting the contest and the org. */
  taskObserver: boolean;
  /** At least a manager of the task, counting the contest and the org. */
  taskManager: boolean;
};

export function viewerOf(
  org: string,
  contest: string,
  task: string,
  roles: Roles,
  entry: { entrant: { status: string } | null } | null,
): Viewer {
  return {
    approvedEntrant: entry?.entrant?.status === 'approved',
    contestStaff: covers(roles, org, contest, null, 'observer'),
    taskObserver: covers(roles, org, contest, task, 'observer'),
    taskManager: covers(roles, org, contest, task, 'manager'),
  };
}
