import type { Me } from '@/api/types';

type Roles = Me['roles'];

function distinct(names: string[]): string[] {
  return [...new Set(names)].sort();
}

/**
 * The names one level down that a person's own roles reach. A role held
 * further down counts: a role at one task reaches its org and its contest.
 */
export function orgsReached(roles: Roles): string[] {
  return distinct(roles.map((role) => role.names.org));
}

export function contestsReached(roles: Roles, org: string): string[] {
  return distinct(
    roles.flatMap(({ names }) =>
      names.org === org && names.contest !== null ? [names.contest] : [],
    ),
  );
}

export function tasksReached(roles: Roles, org: string, contest: string): string[] {
  return distinct(
    roles.flatMap(({ names }) =>
      names.org === org && names.contest === contest && names.task !== null
        ? [names.task]
        : [],
    ),
  );
}
