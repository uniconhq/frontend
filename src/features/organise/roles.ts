import type { Me } from '@/api/types';

type Roles = Me['roles'];

/** Each name once, in order, for a list a person scans. */
function distinct(names: string[]): string[] {
  return [...new Set(names)].sort();
}

/**
 * The names one level down that a person's own roles reach, read from the
 * roles the session already has. A role held further down counts, since the
 * way to it runs through every scope above it: a role at one task reaches its
 * org and its contest. The org list is made of these, and the org and contest
 * pages show them when the list they read is refused, so the way down still
 * works.
 */
export function orgsReached(roles: Roles): string[] {
  return distinct(roles.map((role) => role.scope.org));
}

export function contestsReached(roles: Roles, org: string): string[] {
  return distinct(
    roles.flatMap(({ scope }) =>
      scope.org === org && scope.contest !== null ? [scope.contest] : [],
    ),
  );
}

export function tasksReached(roles: Roles, org: string, contest: string): string[] {
  return distinct(
    roles.flatMap(({ scope }) =>
      scope.org === org && scope.contest === contest && scope.task !== null
        ? [scope.task]
        : [],
    ),
  );
}

type RoleName = 'admin' | 'manager' | 'observer';

const RANK: Record<RoleName, number> = { admin: 3, manager: 2, observer: 1 };

function rankOf(role: string): number {
  return Object.hasOwn(RANK, role) ? RANK[role as RoleName] : 0;
}

/**
 * Whether the roles amount to at least `role` at the contest, counting one
 * held at its org. The routes check again underneath; this only decides what
 * a page offers.
 */
export function holdsAtContest(
  roles: Roles,
  org: string,
  contest: string,
  role: RoleName,
): boolean {
  return roles.some(
    ({ scope, role: held }) =>
      scope.org === org &&
      scope.task === null &&
      (scope.contest === null || scope.contest === contest) &&
      rankOf(held) >= RANK[role],
  );
}
