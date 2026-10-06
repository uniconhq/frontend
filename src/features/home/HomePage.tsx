import { useLocation } from 'react-router';
import { PageTitle } from '@/ui/PageTitle';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { CreateAccountLink, currentPath, loginHref, useSession } from '@/session';
import { MyContests, PublicContests } from './ContestList';
import { PendingInvites } from './MyInvites';
import { ServerClock } from './ServerClock';
import classes from './HomePage.module.css';

/**
 * The landing page, and never blank: signed out it is the door, with a way to
 * create an account when the instance is open, and the public contests, which
 * is everything a visitor may read; signed in it says who you are, shows any
 * invites waiting for you, and lists every contest you see, with where your
 * registration for each stands.
 */
export function HomePage() {
  const session = useSession();
  const location = useLocation();

  return (
    <div className={classes.page}>
      <PageTitle>Unicon</PageTitle>
      <BodyText size="md">
        Run a contest of any shape, whether algorithms, models or notebooks, on repos,
        pipelines and verdicts you can inspect.
      </BodyText>

      {session.status === 'loading' && <PageSkeleton rows={1} />}

      {session.status === 'signed-out' && (
        <>
          <div className={classes.actions}>
            <Button href={loginHref(currentPath(location))}>Sign in</Button>
            <CreateAccountLink />
          </div>
          <PublicContests />
        </>
      )}

      {session.status === 'signed-in' && (
        <>
          <BodyText>
            Signed in as {session.me.user.username}
            {session.me.degraded
              ? '. Forgejo is not answering, so your name and avatar are missing.'
              : ''}
          </BodyText>
          <PendingInvites />
          <MyContests />
        </>
      )}

      <ServerClock />
    </div>
  );
}
