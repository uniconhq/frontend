import { Link } from 'react-router';
import { UniconLockup } from '@/ui/brand/UniconLockup';
import { Breadcrumb } from './Breadcrumb';
import { AccountMenu } from './AccountMenu';
import classes from './Header.module.css';

export function Header() {
  return (
    <header className={classes.header}>
      <Link to="/" className={classes.lockup} aria-label="Unicon, home">
        <UniconLockup size={16} />
      </Link>
      <Breadcrumb />
      <div className={classes.spacer} />
      <AccountMenu />
    </header>
  );
}
