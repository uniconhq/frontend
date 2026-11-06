import { useQuery } from '@tanstack/react-query';
import { byPlace } from '@/api/place';
import { $api, widenQuery } from '@/api/query';
import type { Holder, RoleName } from '@/api/types';
import type { RolePlace } from '../roles';

const ORG = '/api/v1/orgs/{org}/roles';
const CONTEST = '/api/v1/orgs/{org}/contests/{contest}/roles';
const TASK = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/roles';

export function holdersQuery(place: RolePlace) {
  return byPlace(place, {
    org: (path) => widenQuery($api.queryOptions('get', ORG, { params: { path } })),
    contest: (path) =>
      widenQuery($api.queryOptions('get', CONTEST, { params: { path } })),
    task: (path) => widenQuery($api.queryOptions('get', TASK, { params: { path } })),
  });
}

export function useHolders(place: RolePlace, { enabled }: { enabled: boolean }) {
  return useQuery<Holder[]>({ ...holdersQuery(place), enabled });
}

/**
 * Give someone a role at the place, which moves them from the one they hold
 * directly there, and take every role they hold directly there away. Every
 * mutation exists on every render, since hooks cannot be chosen between.
 */
export function useRoleChanges(place: RolePlace) {
  const grantOrg = $api.useMutation('post', ORG);
  const grantContest = $api.useMutation('post', CONTEST);
  const grantTask = $api.useMutation('post', TASK);
  const revokeOrg = $api.useMutation('delete', `${ORG}/{user_id}`);
  const revokeContest = $api.useMutation('delete', `${CONTEST}/{user_id}`);
  const revokeTask = $api.useMutation('delete', `${TASK}/{user_id}`);

  const grant = async (username: string, role: RoleName): Promise<void> => {
    const body = { username, role };
    await byPlace(place, {
      org: (path) => grantOrg.mutateAsync({ params: { path }, body }),
      contest: (path) => grantContest.mutateAsync({ params: { path }, body }),
      task: (path) => grantTask.mutateAsync({ params: { path }, body }),
    });
  };

  const revoke = async (user_id: number): Promise<void> => {
    await byPlace(place, {
      org: (path) => revokeOrg.mutateAsync({ params: { path: { ...path, user_id } } }),
      contest: (path) =>
        revokeContest.mutateAsync({ params: { path: { ...path, user_id } } }),
      task: (path) =>
        revokeTask.mutateAsync({ params: { path: { ...path, user_id } } }),
    });
  };

  return { grant, revoke };
}
