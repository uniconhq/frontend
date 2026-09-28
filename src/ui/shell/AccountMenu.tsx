import { useState } from 'react';
import { Menu, UnstyledButton } from '@mantine/core';
import { Link, useLocation } from 'react-router';
import { Avatar } from '@/ui/Avatar';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { currentPath, loginHref, useLogout, useSession } from '@/session';
import { forgeUrl } from '@/lib/config';
import { t } from '@/lib/t';
import classes from './AccountMenu.module.css';

/**
 * The account slot in the header. Signing in is a full-page navigation to the
 * backend, never a form: the app never sees a password or a token.
 *
 * There is no switch account item. Forgejo only accepts a logout as a POST
 * carrying its own CSRF token, so a link to /user/logout answers 404. The
 * dropdown is controlled rather than left to Mantine so that a refused sign-out
 * stays readable; Mantine closes a menu when an item is clicked, which would
 * take the reason with it.
 */
export function AccountMenu() {
  const session = useSession();
  const location = useLocation();
  const { signOut, clearError, pending, error } = useLogout();
  const [opened, setOpened] = useState(false);

  if (session.status === 'loading') return null;

  if (session.status === 'unavailable') {
    return <span className={classes.unknown}>{t('Account unavailable')}</span>;
  }

  if (session.status === 'signed-out') {
    return (
      <a href={loginHref(currentPath(location))} className={classes.signIn}>
        {t('Sign in')}
      </a>
    );
  }

  const { me } = session;
  const label = me.name ?? me.username;

  const setOpen = (next: boolean) => {
    setOpened(next);
    if (!next && !pending) clearError();
  };

  return (
    <Menu
      opened={opened || error !== null}
      onChange={setOpen}
      position="bottom-end"
      width={240}
      withinPortal
    >
      <Menu.Target>
        <UnstyledButton className={classes.trigger} aria-label={t('Account menu')}>
          <Avatar src={me.avatar_url} name={label} size={24} />
          <span className={classes.username}>{me.username}</span>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item component={Link} to="/account">
          {t('Account')}
        </Menu.Item>
        <Menu.Item component="a" href={forgeUrl(`/${me.username}`)}>
          {t('Forgejo')}
        </Menu.Item>
        <Menu.Item
          closeMenuOnClick={false}
          disabled={pending}
          onClick={() => void signOut('/')}
        >
          {t('Sign out')}
        </Menu.Item>
        {error !== null && (
          <div className={classes.signOutError} role="alert">
            <ErrorBlock error={error} compact />
          </div>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
