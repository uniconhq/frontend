import { $api, queryView } from '@/api/query';
import type { Announcement } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Card } from '@/ui/Card';
import { SectionTitle } from '@/ui/SectionTitle';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useFallbackPoll } from '@/live';
import { AnnouncementContent } from '@/ui/threads/ThreadParts';
import { itemClass } from '@/ui/threads/item-class';
import classes from '@/ui/threads/threads.module.css';

/** One announcement as anyone reads it, as an item of a list. */
function AnnouncementItem({
  announcement,
  showPlace,
}: {
  announcement: Announcement;
  showPlace: boolean;
}) {
  return (
    <li className={itemClass(announcement)}>
      <AnnouncementContent announcement={announcement} showPlace={showPlace} />
    </li>
  );
}

function Listed({
  announcements,
  showPlace,
}: {
  announcements: Announcement[];
  showPlace: boolean;
}) {
  if (announcements.length === 0) {
    return <BodyText tone="secondary">No announcements.</BodyText>;
  }
  return (
    <ol className={classes.list} aria-label="Announcements">
      {[...announcements].reverse().map((announcement) => (
        <AnnouncementItem
          key={`${announcement.where.task ?? ''}#${String(announcement.number)}`}
          announcement={announcement}
          showPlace={showPlace}
        />
      ))}
    </ol>
  );
}

/**
 * The open announcements of a contest and of each task released to the
 * reader, newest first, beside the contest's home. Refetched when a nudge
 * says one changed, and polled while the live stream is closed.
 */
export function ContestAnnouncements({
  org,
  contest,
}: {
  org: string;
  contest: string;
}) {
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/home/announcements',
      { params: { path: { org, contest } } },
      { refetchInterval: useFallbackPoll(60_000) },
    ),
  );
  return (
    <div className={classes.stack}>
      <SectionTitle>Announcements</SectionTitle>
      {view.state === 'loading' && <PageSkeleton rows={2} />}
      {view.state === 'error' && <ErrorBlock error={view.error} onRetry={view.retry} />}
      {view.state === 'ready' && <Listed announcements={view.data} showPlace />}
    </div>
  );
}

/**
 * The open announcements of one released task, newest first, in a card of
 * their own beside its page, and nothing at all while there are none.
 */
export function TaskAnnouncements({
  org,
  contest,
  task,
}: {
  org: string;
  contest: string;
  task: string;
}) {
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/page/announcements',
      { params: { path: { org, contest, task } } },
      { refetchInterval: useFallbackPoll(60_000) },
    ),
  );
  if (view.state === 'loading') return null;
  if (view.state === 'ready' && view.data.length === 0) return null;
  return (
    <Card>
      <div className={classes.stack}>
        <SectionTitle>Announcements</SectionTitle>
        {view.state === 'error' && (
          <ErrorBlock error={view.error} onRetry={view.retry} />
        )}
        {view.state === 'ready' && (
          <Listed announcements={view.data} showPlace={false} />
        )}
      </div>
    </Card>
  );
}
