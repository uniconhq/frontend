import { Link } from 'react-router';
import { UniconLockup } from '@/ui/brand/UniconLockup';
import { t } from '@/lib/t';
import { Breadcrumb } from './Breadcrumb';
import { AccountMenu } from './AccountMenu';
import classes from './Header.module.css';

/**
 * Lockup on the left, clicking it goes to browse; then the breadcrumb, which is
 * also the sideways switcher once there is a contest in context. On the right
 * the account slot: a sign-in link or the avatar menu.
 */
export function Header() {
  return (
    <header className={classes.header}>
      <Link to="/" className={classes.lockup} aria-label={t('Unicon, browse contests')}>
        <UniconLockup size={16} />
      </Link>
      <Breadcrumb />
      <div className={classes.spacer} />
      <AccountMenu />
    </header>
  );
}
