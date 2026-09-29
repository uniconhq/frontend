import { NavLink } from 'react-router';
import { useSession } from '@/session';
import { t } from '@/lib/t';
import classes from './Sidebar.module.css';

/**
 * Quick jumps within whatever is in context. Most items need a contest, and no
 * contestant routes exist yet, so those render as plain text: the shape of the
 * product is part of the first screen a person sees. Text rather than a
 * disabled control, since there is nothing to disable.
 *
 * `signedIn` items are for someone with an account, so a visitor does not see
 * them. `section` items stay marked on every page below their address.
 */
type Item = { label: string; to?: string; signedIn?: boolean; section?: boolean };
type Group = { label: string; items: Item[] };

const GROUPS: Group[] = [
  {
    label: 'Contest',
    items: [{ label: 'Tasks' }, { label: 'Leaderboard' }, { label: 'Submissions' }],
  },
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

  return (
    <nav className={classes.sidebar} aria-label={t('Sections')}>
      {GROUPS.map((group) => (
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
