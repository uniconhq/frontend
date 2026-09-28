import { NavLink } from 'react-router';
import { t } from '@/lib/t';
import classes from './Sidebar.module.css';

/**
 * Quick jumps within whatever is in context. Everything except Browse contests
 * needs a contest, and no contest routes exist yet, so those items render as
 * plain text: the shape of the product is part of the first screen a person
 * sees. Text rather than a disabled control, since there is nothing to disable.
 */
type Item = { label: string; to?: string };
type Group = { label: string; items: Item[] };

const GROUPS: Group[] = [
  {
    label: 'Contest',
    items: [{ label: 'Tasks' }, { label: 'Leaderboard' }, { label: 'Submissions' }],
  },
  {
    label: 'Admin',
    items: [
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
  return (
    <nav className={classes.sidebar} aria-label={t('Sections')}>
      {GROUPS.map((group) => (
        <div key={group.label}>
          <div className={classes.groupLabel}>{t(group.label)}</div>
          {group.items.map((item) =>
            item.to === undefined ? (
              <span key={item.label} className={`${classes.item} ${classes.upcoming}`}>
                {t(item.label)}
              </span>
            ) : (
              <NavLink
                key={item.label}
                to={item.to}
                end
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
