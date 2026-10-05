import type { Announcement } from '@/api/types';
import classes from './threads.module.css';

/** The class of an announcement's list item, dimmed once it is closed. */
export function itemClass(announcement: Announcement): string {
  return [classes.item, announcement.closed ? classes.closed : undefined]
    .filter((name) => name !== undefined)
    .join(' ');
}
