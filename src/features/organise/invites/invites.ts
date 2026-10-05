import { useQuery } from '@tanstack/react-query';
import { $api, widenQuery } from '@/api/query';
import type { Grant, Invite } from '@/api/types';
import type { RolePlace } from '../roles';

/**
 * The invite routes are the same four under an org, a contest and a task, so
 * the section takes a place and these choose the address, as the role routes
 * do in `people/holders.ts`.
 */
const ORG = '/api/v1/orgs/{org}/invites';
const CONTEST = '/api/v1/orgs/{org}/contests/{contest}/invites';
const TASK = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/invites';

export function invitesQuery(place: RolePlace) {
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

/** Who an invite is for: a username, or an address to mail. */
export type Target = { username: string } | { email: string };

/**
 * Make an invite at the place, mail a pending one again, and take one back.
 * Every mutation exists on every render, since hooks cannot be chosen
 * between, and the place picks which one runs.
 */
export function useInviteChanges(place: RolePlace) {
  const createOrg = $api.useMutation('post', ORG);
  const createContest = $api.useMutation('post', CONTEST);
  const createTask = $api.useMutation('post', TASK);
  const againOrg = $api.useMutation('post', `${ORG}/{invite_id}/send-again` as const);
  const againContest = $api.useMutation(
    'post',
    `${CONTEST}/{invite_id}/send-again` as const,
  );
  const againTask = $api.useMutation('post', `${TASK}/{invite_id}/send-again` as const);
  const withdrawOrg = $api.useMutation('post', `${ORG}/{invite_id}/withdraw` as const);
  const withdrawContest = $api.useMutation(
    'post',
    `${CONTEST}/{invite_id}/withdraw` as const,
  );
  const withdrawTask = $api.useMutation(
    'post',
    `${TASK}/{invite_id}/withdraw` as const,
  );

  const create = async (grants: Grant, target: Target): Promise<Invite> => {
    const body = { grants, ...target };
    switch (place.kind) {
      case 'org':
        return createOrg.mutateAsync({ params: { path: { org: place.org } }, body });
      case 'contest':
        return createContest.mutateAsync({
          params: { path: { org: place.org, contest: place.contest } },
          body,
        });
      case 'task':
        return createTask.mutateAsync({
          params: {
            path: { org: place.org, contest: place.contest, task: place.task },
          },
          body,
        });
    }
  };

  /** One invite's path at the place, for each kind, which both changes take. */
  const org = (invite_id: string) => ({ org: place.org, invite_id });
  const contest = (invite_id: string, contest: string) => ({
    ...org(invite_id),
    contest,
  });

  const sendAgain = async (invite: string): Promise<Invite> => {
    switch (place.kind) {
      case 'org':
        return againOrg.mutateAsync({ params: { path: org(invite) } });
      case 'contest':
        return againContest.mutateAsync({
          params: { path: contest(invite, place.contest) },
        });
      case 'task':
        return againTask.mutateAsync({
          params: { path: { ...contest(invite, place.contest), task: place.task } },
        });
    }
  };

  const withdraw = async (invite: string): Promise<Invite> => {
    switch (place.kind) {
      case 'org':
        return withdrawOrg.mutateAsync({ params: { path: org(invite) } });
      case 'contest':
        return withdrawContest.mutateAsync({
          params: { path: contest(invite, place.contest) },
        });
      case 'task':
        return withdrawTask.mutateAsync({
          params: { path: { ...contest(invite, place.contest), task: place.task } },
        });
    }
  };

  return { create, sendAgain, withdraw };
}
