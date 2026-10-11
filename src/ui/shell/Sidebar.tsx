import { Link, useLocation, useParams } from 'react-router';
import { useSession } from '@/session';
import { contestHomePath, isContestantPath } from '@/lib/contest-paths';
import { contestPath, isOrganiserPath, orgPath, taskPath } from '@/lib/organiser-paths';
import {
  CONTEST_SECTIONS,
  CONTEST_VIEW_SECTIONS,
  ORG_SECTIONS,
  TASK_BUILD_CARDS,
  TASK_SECTIONS,
  taskCardPath,
  TOP_PLACES,
  contestSectionPath,
  contestViewSectionPath,
  orgSectionPath,
  taskSectionPath,
} from '@/lib/sections';
import classes from './Sidebar.module.css';

/**
 * An entry stands for its own address and, unless it is `exact`, every page
 * below it, such as a file open in Files; an address with a query, such as a
 * task's card, only with that query. `also` is a further address it stands
 * for, such as a contest's tasks for a task's page.
 */
type Item = { label: string; to: string; exact?: boolean; also?: string };
type Group = { label: string; items: Item[] };

/** How closely an entry stands for where you are, or null when it does not. */
function closeness(item: Item, pathname: string, search: string): number | null {
  const under = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  const [path = '', query = ''] = item.to.split('?');
  if (query !== '') {
    const have = new URLSearchParams(search);
    const wanted = [...new URLSearchParams(query)];
    return pathname === path && wanted.every(([key, value]) => have.get(key) === value)
      ? item.to.length
      : null;
  }
  if (item.also !== undefined && under(item.also)) return item.also.length;
  return (item.exact === true ? pathname === path : under(path)) ? path.length : null;
}

/** The one entry that is where you are: the one that stands for it most closely. */
function currentOf(groups: Group[], pathname: string, search: string): Item | null {
  let best: Item | null = null;
  let most = -1;
  for (const item of groups.flatMap((group) => group.items)) {
    const close = closeness(item, pathname, search);
    if (close !== null && close > most) {
      best = item;
      most = close;
    }
  }
  return best;
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
          ...TASK_BUILD_CARDS.map((card) => ({
            label: card.label,
            to: taskCardPath(org, contest, task, card.key),
            exact: true,
          })),
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
  const { pathname, search } = useLocation();
  const place = here(pathname, useParams());
  const top: Group = {
    label: 'Unicon',
    items: TOP_PLACES.filter((item) => !item.signedIn || signedIn).map((item) => ({
      label: item.label,
      to: item.to,
      exact: item.to === '/',
    })),
  };

  const groups = [...(place === null ? [] : [place]), top];
  const current = currentOf(groups, pathname, search);

  return (
    <nav className={classes.sidebar} aria-label="Sections">
      {groups.map((group) => (
        <div
          key={group.label}
          className={classes.group}
          role="group"
          aria-label={group.label}
        >
          <div className={classes.groupLabel} aria-hidden="true">
            {group.label}
          </div>
          {group.items.map((item) => {
            const here = item === current;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={here ? `${classes.item} ${classes.active}` : classes.item}
                aria-current={here ? 'page' : undefined}
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
