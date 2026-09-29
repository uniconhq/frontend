import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { PageTitle } from '@/ui/PageTitle';
import { CreateAccountLink, currentPath, loginHref } from '@/session';
import { t } from '@/lib/t';
import classes from './contest.module.css';

/** The way in, back to this page: sign in, and create an account where open. */
export function SignInButtons() {
  const location = useLocation();
  return (
    <div className={classes.actions}>
      <Button href={loginHref(currentPath(location))}>{t('Sign in')}</Button>
      <CreateAccountLink />
    </div>
  );
}

/**
 * What a visitor meets on a contest or a task that is not public: it may be
 * one they see with an account, or it may not be there, and the page cannot
 * say which without telling a visitor what exists.
 */
export function SignInPrompt({ title, back }: { title: string; back?: ReactNode }) {
  return (
    <div className={classes.page}>
      {back}
      <PageTitle>{title}</PageTitle>
      <BodyText>
        {t('It is open to people with an account, or it is not there.')}
      </BodyText>
      <SignInButtons />
    </div>
  );
}
