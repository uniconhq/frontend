import { Link } from 'react-router';
import { UniconLockup } from '@/ui/brand/UniconLockup';
import { Breadcrumb } from './Breadcrumb';
import { AccountMenu } from './AccountMenu';
import classes from './Header.module.css';

/**
 * Lockup on the left, clicking it goes to browse; then the breadcrumb, which is
 * also the sideways switcher once there is a contest in context. On the right
 * the account slot: a sign-in link or the avatar menu. Task 5 adds the contest
 * timer and the LIVE pill between them.
 */
export function Header() {
  return (
    <header className={classes.header}>
      <Link to="/" className={classes.lockup} aria-label="Unicon, browse contests">
        <UniconLockup size={16} />
      </Link>
      <Breadcrumb />
      <div className={classes.spacer} />
      <AccountMenu />
    </header>
  );
}
