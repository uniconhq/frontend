import type { Me, RoleName, ScopeNames } from '@/api/types';

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

const RANK: Record<RoleName, number> = { admin: 3, manager: 2, observer: 1 };

function rankOf(role: string): number {
  return Object.hasOwn(RANK, role) ? RANK[role as RoleName] : 0;
}

/** An org, a contest or a task, the three places a role is held at. */
export type RolePlace =
  | { kind: 'org'; org: string }
  | { kind: 'contest'; org: string; contest: string }
  | { kind: 'task'; org: string; contest: string; task: string };

/**
 * Whether the roles amount to at least `role` at the place, counting one held
 * at a broader scope: an org's role reaches its contests and their tasks. The
 * routes check again underneath; this only decides what a page offers.
 */
export function holdsAt(roles: Roles, place: RolePlace, role: RoleName): boolean {
  const contest = place.kind === 'org' ? null : place.contest;
  const task = place.kind === 'task' ? place.task : null;
  return roles.some(
    ({ names, role: held }) =>
      names.org === place.org &&
      (names.contest === null || names.contest === contest) &&
      (names.task === null || names.task === task) &&
      rankOf(held) >= RANK[role],
  );
}

/**
 * Whether `names` is the place itself rather than a broader scope that
 * reaches it, such as the org of a contest.
 */
export function isPlace(names: ScopeNames, place: RolePlace): boolean {
  return (
    names.org === place.org &&
    names.contest === (place.kind === 'org' ? null : place.contest) &&
    names.task === (place.kind === 'task' ? place.task : null)
  );
}

export function holdsAtContest(
  roles: Roles,
  org: string,
  contest: string,
  role: RoleName,
): boolean {
  return holdsAt(roles, { kind: 'contest', org, contest }, role);
}
