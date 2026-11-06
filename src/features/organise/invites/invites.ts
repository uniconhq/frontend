import { useQuery } from '@tanstack/react-query';
import { byPlace } from '@/api/place';
import { $api, widenQuery } from '@/api/query';
import type { Invite, OfferedGrant } from '@/api/types';
import type { Target } from '@/ui/InviteForm';
import type { RolePlace } from '../roles';

const ORG = '/api/v1/orgs/{org}/invites';
const CONTEST = '/api/v1/orgs/{org}/contests/{contest}/invites';
const TASK = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/invites';

export function invitesQuery(place: RolePlace) {
  return byPlace(place, {
    org: (path) => widenQuery($api.queryOptions('get', ORG, { params: { path } })),
    contest: (path) =>
      widenQuery($api.queryOptions('get', CONTEST, { params: { path } })),
    task: (path) => widenQuery($api.queryOptions('get', TASK, { params: { path } })),
  });
}

/** How often the list is read while a mail is still waiting to go out. */
const WAITING_POLL_MS = 5000;

function waiting(invites: Invite[] | undefined): boolean {
  return (
    invites?.some(
      (invite) => invite.status === 'pending' && invite.mail_status === 'waiting',
    ) ?? false
  );
}

/**
 * The place's invites, read again every few seconds while a mail is still
 * waiting, since it goes out after the route answers and nothing says when.
 */
export function useInvites(place: RolePlace) {
  return useQuery<Invite[]>({
    ...invitesQuery(place),
    refetchInterval: (query) => (waiting(query.state.data) ? WAITING_POLL_MS : false),
  });
}

/**
 * Make an invite at the place, mail a pending one again, and take one back.
 * Every mutation exists on every render, since hooks cannot be chosen between.
 */
export function useInviteChanges(place: RolePlace) {
  const createOrg = $api.useMutation('post', ORG);
  const createContest = $api.useMutation('post', CONTEST);
  const createTask = $api.useMutation('post', TASK);
  const againOrg = $api.useMutation('post', `${ORG}/{invite_id}/send-again`);
  const againContest = $api.useMutation('post', `${CONTEST}/{invite_id}/send-again`);
  const againTask = $api.useMutation('post', `${TASK}/{invite_id}/send-again`);
  const withdrawOrg = $api.useMutation('post', `${ORG}/{invite_id}/withdraw`);
  const withdrawContest = $api.useMutation('post', `${CONTEST}/{invite_id}/withdraw`);
  const withdrawTask = $api.useMutation('post', `${TASK}/{invite_id}/withdraw`);

  /** `entrant`, at a contest, puts the person straight into that entrant once they accept. */
  const create = (
    grants: OfferedGrant,
    target: Target,
    entrant?: string,
  ): Promise<Invite> => {
    const body = { grants, ...target, ...(entrant !== undefined && { entrant }) };
    return byPlace(place, {
      org: (path) => createOrg.mutateAsync({ params: { path }, body }),
      contest: (path) => createContest.mutateAsync({ params: { path }, body }),
      task: (path) => createTask.mutateAsync({ params: { path }, body }),
    });
  };

  const sendAgain = (invite_id: string): Promise<Invite> =>
    byPlace(place, {
      org: (path) => againOrg.mutateAsync({ params: { path: { ...path, invite_id } } }),
      contest: (path) =>
        againContest.mutateAsync({ params: { path: { ...path, invite_id } } }),
      task: (path) =>
        againTask.mutateAsync({ params: { path: { ...path, invite_id } } }),
    });

  const withdraw = (invite_id: string): Promise<Invite> =>
    byPlace(place, {
      org: (path) =>
        withdrawOrg.mutateAsync({ params: { path: { ...path, invite_id } } }),
      contest: (path) =>
        withdrawContest.mutateAsync({ params: { path: { ...path, invite_id } } }),
      task: (path) =>
        withdrawTask.mutateAsync({ params: { path: { ...path, invite_id } } }),
    });

  return { create, sendAgain, withdraw };
}
