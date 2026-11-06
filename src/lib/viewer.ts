import type { Me } from '@/api/types';

type Roles = Me['roles'];

/**
 * Any role at the org or the contest, as the forge reads a leaderboard for
 * staff. A role at one of its tasks alone is not.
 */
export function contestStaff(org: string, contest: string, roles: Roles): boolean {
  return roles.some(
    ({ names }) =>
      names.task === null &&
      names.org === org &&
      (names.contest === null || names.contest === contest),
  );
}
