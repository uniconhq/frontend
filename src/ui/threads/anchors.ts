import type { AnnouncementLink } from '@/api/types';

/** Where an announcement sits in a list, so a message naming it can link there. */
export function announcementAnchor(
  link: Pick<AnnouncementLink, 'task' | 'number'>,
): string {
  return link.task === null
    ? `announcement-${String(link.number)}`
    : `announcement-${link.task}-${String(link.number)}`;
}
