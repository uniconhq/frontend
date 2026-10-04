import { useQuery } from '@tanstack/react-query';
import { $api, widenQuery } from '@/api/query';
import type { Holder, RoleName } from '@/api/types';
import type { RolePlace } from '../roles';

/**
 * The role routes are the same three under an org, a contest and a task, so
 * the section takes a place and these choose the address.
 */
const ORG = '/api/v1/orgs/{org}/roles';
const CONTEST = '/api/v1/orgs/{org}/contests/{contest}/roles';
const TASK = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/roles';

export function holdersQuery(place: RolePlace) {
  switch (place.kind) {
    case 'org':
      return widenQuery(
        $api.queryOptions('get', ORG, { params: { path: { org: place.org } } }),
      );
    case 'contest':
      return widenQuery(
        $api.queryOptions('get', CONTEST, {
          params: { path: { org: place.org, contest: place.contest } },
        }),
      );
    case 'task':
      return widenQuery(
        $api.queryOptions('get', TASK, {
          params: {
            path: { org: place.org, contest: place.contest, task: place.task },
          },
        }),
      );
  }
}

export function useHolders(place: RolePlace, { enabled }: { enabled: boolean }) {
  return useQuery<Holder[]>({ ...holdersQuery(place), enabled });
}

/**
 * Give someone a role at the place, which moves them from the one they hold
 * directly there, and take every role they hold directly there away. All six
 * mutations exist on every render, since hooks cannot be chosen between, and
 * the place picks which one runs.
 */
export function useRoleChanges(place: RolePlace) {
  const grantOrg = $api.useMutation('post', ORG);
  const grantContest = $api.useMutation('post', CONTEST);
  const grantTask = $api.useMutation('post', TASK);
  const revokeOrg = $api.useMutation('delete', '/api/v1/orgs/{org}/roles/{user_id}');
  const revokeContest = $api.useMutation(
    'delete',
    '/api/v1/orgs/{org}/contests/{contest}/roles/{user_id}',
  );
  const revokeTask = $api.useMutation(
    'delete',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/roles/{user_id}',
  );

  const grant = async (username: string, role: RoleName): Promise<void> => {
    const body = { username, role };
    switch (place.kind) {
      case 'org':
        await grantOrg.mutateAsync({ params: { path: { org: place.org } }, body });
        return;
      case 'contest':
        await grantContest.mutateAsync({
          params: { path: { org: place.org, contest: place.contest } },
          body,
        });
        return;
      case 'task':
        await grantTask.mutateAsync({
          params: {
            path: { org: place.org, contest: place.contest, task: place.task },
          },
          body,
        });
        return;
    }
  };

  const revoke = async (userId: number): Promise<void> => {
    switch (place.kind) {
      case 'org':
        await revokeOrg.mutateAsync({
          params: { path: { org: place.org, user_id: userId } },
        });
        return;
      case 'contest':
        await revokeContest.mutateAsync({
          params: { path: { org: place.org, contest: place.contest, user_id: userId } },
        });
        return;
      case 'task':
        await revokeTask.mutateAsync({
          params: {
            path: {
              org: place.org,
              contest: place.contest,
              task: place.task,
              user_id: userId,
            },
          },
        });
        return;
    }
  };

  return { grant, revoke };
}
