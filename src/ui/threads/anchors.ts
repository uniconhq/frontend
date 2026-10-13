import type { AnnouncementLink } from '@/api/types';

/**
 * The anchor an announcement stands at in a list of them, so a message
 * naming it can link there: one of the contest by its number, one of a task
 * by the task's name and its number.
 */
export function announcementAnchor(
  link: Pick<AnnouncementLink, 'task' | 'number'>,
): string {
  return link.task === null
    ? `announcement-${String(link.number)}`
    : `announcement-${link.task}-${String(link.number)}`;
}
