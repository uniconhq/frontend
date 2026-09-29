import { NavLink, useLocation, useParams } from 'react-router';
import { useSession } from '@/session';
import { contestHomePath, isContestantPath } from '@/lib/contest-paths';
import { t } from '@/lib/t';
import classes from './Sidebar.module.css';

/**
 * Quick jumps within whatever is in context. The contest items need a contest
 * page open, and the pages some of them lead to do not exist yet, so an item
 * with nowhere to go renders as plain text: the shape of the product is part
 * of the first screen a person sees. Text rather than a disabled control,
 * since there is nothing to disable. On a contest's pages, Tasks leads to the
 * contest's own page, where its tasks are listed.
 *
 * `signedIn` items are for someone with an account, so a visitor does not see
 * them. `section` items stay marked on every page below their address.
 */
type Item = { label: string; to?: string; signedIn?: boolean; section?: boolean };
type Group = { label: string; items: Item[] };

function groups(contestHome: string | undefined): Group[] {
  return [
    {
      label: 'Contest',
      items: [
        { label: 'Tasks', to: contestHome },
        { label: 'Leaderboard' },
        { label: 'Submissions' },
      ],
    },
    ...OTHER_GROUPS,
  ];
}

const OTHER_GROUPS: Group[] = [
  {
    label: 'Admin',
    items: [
      { label: 'Orgs', to: '/orgs', signedIn: true, section: true },
      { label: 'Contest setup' },
      { label: 'Task authoring' },
      { label: 'Runners' },
    ],
  },
  {
    label: 'Discover',
    items: [{ label: 'Browse contests', to: '/' }],
  },
];

export function Sidebar() {
  const session = useSession();
  const signedIn = session.status === 'signed-in';
  const { pathname } = useLocation();
  const { org, contest } = useParams();
  const contestHome =
    isContestantPath(pathname) && org !== undefined && contest !== undefined
      ? contestHomePath(org, contest)
      : undefined;

  return (
    <nav className={classes.sidebar} aria-label={t('Sections')}>
      {groups(contestHome).map((group) => (
        <div key={group.label}>
          <div className={classes.groupLabel}>{t(group.label)}</div>
          {group.items
            .filter((item) => item.signedIn !== true || signedIn)
            .map((item) =>
              item.to === undefined ? (
                <span
                  key={item.label}
                  className={`${classes.item} ${classes.upcoming}`}
                >
                  {t(item.label)}
                </span>
              ) : (
                <NavLink
                  key={item.label}
                  to={item.to}
                  end={item.section !== true}
                  className={({ isActive }) =>
                    isActive ? `${classes.item} ${classes.active}` : classes.item
                  }
                >
                  {t(item.label)}
                </NavLink>
              ),
            )}
        </div>
      ))}
    </nav>
  );
}
