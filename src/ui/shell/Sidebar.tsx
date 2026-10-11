import { Link, useLocation, useParams } from 'react-router';
import { useSession } from '@/session';
import { contestHomePath, isContestantPath } from '@/lib/contest-paths';
import { contestPath, isOrganiserPath, orgPath, taskPath } from '@/lib/organiser-paths';
import {
  CONTEST_SECTIONS,
  CONTEST_VIEW_SECTIONS,
  ORG_SECTIONS,
  TASK_SECTIONS,
  TOP_PLACES,
  contestSectionPath,
  contestViewSectionPath,
  orgSectionPath,
  taskSectionPath,
} from '@/lib/sections';
import classes from './Sidebar.module.css';

/**
 * An entry is marked as where you are on its own address and, unless it is
 * `exact`, on every page below it, such as a file open in Files. `also` is a
 * further address it stands for, such as a contest's tasks for a task's page.
 */
type Item = { label: string; to: string; exact?: boolean; also?: string };
type Group = { label: string; items: Item[] };

function marks(item: Item, pathname: string): boolean {
  const under = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  if (item.also !== undefined && under(item.also)) return true;
  return item.exact === true ? pathname === item.to : under(item.to);
}

/**
 * Where you are, as the sections of that place: inside an org, a contest or
 * a task as its organiser, its own page first, by its name, then each of its
 * sections in the order its page shows them as cards, from the same list, so
 * the two cannot drift apart; inside a contest as a contestant, its tasks and
 * its leaderboards. Under it, everywhere, the top places, which are all there
 * is outside any org or contest. Nothing is listed that leads nowhere.
 */
function here(
  pathname: string,
  params: Partial<Record<'org' | 'contest' | 'task', string>>,
): Group | null {
  const { org, contest, task } = params;
  if (isOrganiserPath(pathname) && org !== undefined) {
    if (contest !== undefined && task !== undefined) {
      return {
        label: 'Task',
        items: [
          { label: task, to: taskPath(org, contest, task), exact: true },
          ...TASK_SECTIONS.map((section) => ({
            label: section.label,
            to: taskSectionPath(org, contest, task, section.key),
          })),
        ],
      };
    }
    if (contest !== undefined) {
      return {
        label: 'Contest',
        items: [
          { label: contest, to: contestPath(org, contest), exact: true },
          ...CONTEST_SECTIONS.map((section) => ({
            label: section.label,
            to: contestSectionPath(org, contest, section.key),
          })),
        ],
      };
    }
    return {
      label: 'Org',
      items: [
        { label: org, to: orgPath(org), exact: true },
        ...ORG_SECTIONS.map((section) => ({
          label: section.label,
          to: orgSectionPath(org, section.key),
        })),
      ],
    };
  }
  if (isContestantPath(pathname) && org !== undefined && contest !== undefined) {
    return {
      label: 'Contest',
      items: CONTEST_VIEW_SECTIONS.map((section) =>
        section.key === 'tasks'
          ? {
              label: section.label,
              to: contestViewSectionPath(org, contest, section.key),
              exact: true,
              also: `${contestHomePath(org, contest)}/tasks`,
            }
          : {
              label: section.label,
              to: contestViewSectionPath(org, contest, section.key),
            },
      ),
    };
  }
  return null;
}

export function Sidebar() {
  const session = useSession();
  const signedIn = session.status === 'signed-in';
  const { pathname } = useLocation();
  const place = here(pathname, useParams());
  const top: Group = {
    label: 'Unicon',
    items: TOP_PLACES.filter((item) => !item.signedIn || signedIn).map((item) => ({
      label: item.label,
      to: item.to,
      exact: item.to === '/',
    })),
  };

  return (
    <nav className={classes.sidebar} aria-label="Sections">
      {[...(place === null ? [] : [place]), top].map((group) => (
        <div key={group.label} role="group" aria-label={group.label}>
          <div className={classes.groupLabel} aria-hidden="true">
            {group.label}
          </div>
          {group.items.map((item) => {
            const current = marks(item, pathname);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={current ? `${classes.item} ${classes.active}` : classes.item}
                aria-current={pathname === item.to ? 'page' : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
