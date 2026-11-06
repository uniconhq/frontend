import type { Me, RoleName, ScopeNames } from '@/api/types';
import { orgsReached } from '@/lib/reached';

type Roles = Me['roles'];

/** Each role's name, as a page shows it. */
export const ROLE_LABEL: Record<RoleName, string> = {
  admin: 'Admin',
  manager: 'Manager',
  observer: 'Observer',
};

/** What each role lets its holder do, under a choice of role. */
export const ROLE_AREAS = [
  'Change settings',
  'Publish',
  'Manage entrants',
  'Give roles',
] as const;
const ROLE_MEANS: Record<RoleName, readonly string[]> = {
  admin: [
    'Change every setting.',
    'Publish changes.',
    'Manage entrants and approve registrations.',
    'Give or take every role, including admin.',
  ],
  manager: [
    'Change grading and schedule settings.',
    'Publish changes.',
    'Manage entrants and approve registrations.',
    'Give or take manager and observer roles.',
  ],
  observer: [
    'Read settings without changing them.',
    'Read publications without publishing.',
    'Read entrants without changing them.',
    'Read roles without giving or taking them.',
  ],
};

/** A task role never reaches the contest's entrants. */
export function roleMeans(role: RoleName, kind: RolePlace['kind']): readonly string[] {
  return ROLE_MEANS[role].map((line, index) =>
    kind === 'task' && index === 2 ? 'Entrants are managed at contest level.' : line,
  );
}

/** The roles a person may hand out, or invite someone to: admin only by an admin. */
export function offered(administers: boolean): RoleName[] {
  return administers ? ['admin', 'manager', 'observer'] : ['manager', 'observer'];
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

/**
 * Where the person may make a workflow: under their own username, in lower
 * case, and under each org where they hold the manager role or above at the
 * org itself.
 */
export function workflowOwners(me: Me): string[] {
  const managed = me.roles.filter(
    ({ names, role }) =>
      names.contest === null && (role === 'manager' || role === 'admin'),
  );
  return [me.user.username.toLowerCase(), ...orgsReached(managed)];
}
