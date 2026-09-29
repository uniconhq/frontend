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
