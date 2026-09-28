import { useLocation } from 'react-router';
import { PageTitle } from '@/ui/PageTitle';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { CreateAccountLink, currentPath, loginHref, useSession } from '@/session';
import { t } from '@/lib/t';
import { ServerClock } from './ServerClock';
import classes from './HomePage.module.css';

/**
 * The landing page, and never blank: signed out it is the door, with a way to
 * create an account when the instance is open; signed in it says who you are.
 */
export function HomePage() {
  const session = useSession();
  const location = useLocation();

  return (
    <div className={classes.page}>
      <PageTitle>{t('Unicon')}</PageTitle>
      <BodyText size="md">
        {t(
          'Run a contest of any shape, whether algorithms, models or notebooks, on repos, pipelines and verdicts you can inspect.',
        )}
      </BodyText>

      {session.status === 'loading' && <PageSkeleton rows={1} />}

      {session.status === 'signed-out' && (
        <div className={classes.actions}>
          <Button href={loginHref(currentPath(location))}>{t('Sign in')}</Button>
          <CreateAccountLink />
        </div>
      )}

      {session.status === 'signed-in' && (
        <BodyText>
          {t('Signed in as')} {session.me.username}
          {session.me.degraded
            ? t('. Forgejo is not answering, so your name and avatar are missing.')
            : ''}
        </BodyText>
      )}

      <ServerClock />
    </div>
  );
}
