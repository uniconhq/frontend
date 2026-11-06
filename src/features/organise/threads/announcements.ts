import { useQuery } from '@tanstack/react-query';
import { byPlace, type At } from '@/api/place';
import { $api, widenQuery } from '@/api/query';
import type { Announcement } from '@/api/types';

/** A contest or a task, the two places an announcement is posted at. */
export type AnnouncementPlace = At<'contest' | 'task'>;

const CONTEST = '/api/v1/orgs/{org}/contests/{contest}/announcements';
const TASK = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/announcements';

export function announcementsQuery(place: AnnouncementPlace) {
  return byPlace(place, {
    contest: (path) =>
      widenQuery($api.queryOptions('get', CONTEST, { params: { path } })),
    task: (path) => widenQuery($api.queryOptions('get', TASK, { params: { path } })),
  });
}

export function useManagedAnnouncements(
  place: AnnouncementPlace,
  refetchInterval: number | false,
) {
  return useQuery<Announcement[]>({ ...announcementsQuery(place), refetchInterval });
}

type Text = { title: string; body: string };

/**
 * Post, edit, close and reopen at the place. Every mutation exists on every render,
 * since hooks cannot be chosen between.
 */
export function useAnnouncementChanges(place: AnnouncementPlace) {
  const postContest = $api.useMutation('post', CONTEST);
  const postTask = $api.useMutation('post', TASK);
  const editContest = $api.useMutation('patch', `${CONTEST}/{number}`);
  const editTask = $api.useMutation('patch', `${TASK}/{number}`);
  const closeContest = $api.useMutation('post', `${CONTEST}/{number}/close`);
  const closeTask = $api.useMutation('post', `${TASK}/{number}/close`);
  const reopenContest = $api.useMutation('post', `${CONTEST}/{number}/reopen`);
  const reopenTask = $api.useMutation('post', `${TASK}/{number}/reopen`);

  const post = (body: Text): Promise<Announcement> =>
    byPlace(place, {
      contest: (path) => postContest.mutateAsync({ params: { path }, body }),
      task: (path) => postTask.mutateAsync({ params: { path }, body }),
    });
  const edit = (number: number, body: Text): Promise<Announcement> =>
    byPlace(place, {
      contest: (path) =>
        editContest.mutateAsync({ params: { path: { ...path, number } }, body }),
      task: (path) =>
        editTask.mutateAsync({ params: { path: { ...path, number } }, body }),
    });
  const close = (number: number): Promise<Announcement> =>
    byPlace(place, {
      contest: (path) =>
        closeContest.mutateAsync({ params: { path: { ...path, number } } }),
      task: (path) => closeTask.mutateAsync({ params: { path: { ...path, number } } }),
    });
  const reopen = (number: number): Promise<Announcement> =>
    byPlace(place, {
      contest: (path) =>
        reopenContest.mutateAsync({ params: { path: { ...path, number } } }),
      task: (path) => reopenTask.mutateAsync({ params: { path: { ...path, number } } }),
    });
  return { post, edit, close, reopen };
}
