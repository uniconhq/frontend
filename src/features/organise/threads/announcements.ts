import { useQuery } from '@tanstack/react-query';
import { $api, widenQuery } from '@/api/query';
import type { Announcement } from '@/api/types';

/** A contest or a task, the two places an announcement is posted at. */
export type AnnouncementPlace =
  | { kind: 'contest'; org: string; contest: string }
  | { kind: 'task'; org: string; contest: string; task: string };

const CONTEST = '/api/v1/orgs/{org}/contests/{contest}/announcements';
const TASK = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/announcements';

/**
 * The organiser's announcement routes are the same four under a contest and
 * a task, so the section takes a place and these choose the address.
 */
export function announcementsQuery(place: AnnouncementPlace) {
  if (place.kind === 'contest') {
    return widenQuery(
      $api.queryOptions('get', CONTEST, {
        params: { path: { org: place.org, contest: place.contest } },
      }),
    );
  }
  return widenQuery(
    $api.queryOptions('get', TASK, {
      params: { path: { org: place.org, contest: place.contest, task: place.task } },
    }),
  );
}

export function useManagedAnnouncements(
  place: AnnouncementPlace,
  refetchInterval: number | false,
) {
  return useQuery<Announcement[]>({ ...announcementsQuery(place), refetchInterval });
}

type Text = { title: string; body: string };

/**
 * Post, edit and close at the place. Every mutation exists on every render,
 * since hooks cannot be chosen between, and the place picks which one runs.
 */
export function useAnnouncementChanges(place: AnnouncementPlace) {
  const postContest = $api.useMutation('post', CONTEST);
  const postTask = $api.useMutation('post', TASK);
  const editContest = $api.useMutation('patch', `${CONTEST}/{number}`);
  const editTask = $api.useMutation('patch', `${TASK}/{number}`);
  const closeContest = $api.useMutation('post', `${CONTEST}/{number}/close`);
  const closeTask = $api.useMutation('post', `${TASK}/{number}/close`);

  const contestPath = { org: place.org, contest: place.contest };
  const post = (body: Text): Promise<Announcement> =>
    place.kind === 'contest'
      ? postContest.mutateAsync({ params: { path: contestPath }, body })
      : postTask.mutateAsync({
          params: { path: { ...contestPath, task: place.task } },
          body,
        });
  const edit = (number: number, body: Text): Promise<Announcement> =>
    place.kind === 'contest'
      ? editContest.mutateAsync({ params: { path: { ...contestPath, number } }, body })
      : editTask.mutateAsync({
          params: { path: { ...contestPath, task: place.task, number } },
          body,
        });
  const close = (number: number): Promise<Announcement> =>
    place.kind === 'contest'
      ? closeContest.mutateAsync({ params: { path: { ...contestPath, number } } })
      : closeTask.mutateAsync({
          params: { path: { ...contestPath, task: place.task, number } },
        });
  const pending =
    postContest.isPending ||
    postTask.isPending ||
    editContest.isPending ||
    editTask.isPending ||
    closeContest.isPending ||
    closeTask.isPending;
  return { post, edit, close, pending };
}
