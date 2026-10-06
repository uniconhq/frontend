import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { $api, queryView, type QueryView } from '@/api/query';
import { isApiError } from '@/api/problem';
import type { Invite } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { PageTitle } from '@/ui/PageTitle';
import { SectionTitle } from '@/ui/SectionTitle';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useMe } from '@/session';
import { forgetInviteToken, keepInviteToken, readInviteToken } from './invite-token';
import { InviteCard, InviteList } from './MyInvites';
import { useMyInvites } from './my-invites';
import classes from './invites.module.css';

/**
 * A layout route above the session guard on `/invites`: a mail's link arrives
 * as `/invites#<token>`, and the token moves into the tab before anything
 * else reads the address, so a sign-in on the way never carries it in its
 * `?next=`. Keeping it is the same write however often this renders.
 */
export function InviteLink() {
  const location = useLocation();
  const token = location.hash.slice(1);
  if (token !== '') {
    keepInviteToken(token);
    return <Navigate to={`${location.pathname}${location.search}`} replace />;
  }
  return <Outlet />;
}

/**
 * The invite a mail's link opened, above the rest: with its actions while it
 * is open, or what became of it. One that is not this account's, or whose
 * link a newer mail replaced, answers 404, which says so in words.
 */
function OpenedInvite({ view }: { view: QueryView<Invite> }) {
  const me = useMe();

  return (
    <section className={classes.section}>
      <SectionTitle>The invite from your link</SectionTitle>
      {view.state === 'loading' && <PageSkeleton rows={1} />}
      {view.state === 'error' &&
        (isApiError(view.error) && view.error.code === 'not_found' ? (
          <div role="alert">
            <BodyText>
              This link does not open an invite for {me.user.username}. It may have been
              sent to another account, or a newer mail may have replaced it. Sign in
              with the account the invite was sent to, or use the link in the newest
              mail.
            </BodyText>
          </div>
        ) : (
          <ErrorBlock error={view.error} onRetry={view.retry} />
        ))}
      {view.state === 'ready' && (
        <ul className={classes.list} aria-label="The invite from your link">
          <InviteCard invite={view.data} highlighted />
        </ul>
      )}
    </section>
  );
}

/**
 * Every invite waiting for the signed-in person, at `/invites`, which is where
 * an invite's mail links to. The invite the link carried comes first; the
 * others follow, each with Accept and Decline.
 */
export function InvitesPage() {
  const [token] = useState(readInviteToken);
  const view = queryView(useMyInvites());
  const opened = queryView(
    $api.useQuery(
      'post',
      '/api/v1/me/invites/open',
      { body: { token: token ?? '' } },
      { enabled: token !== null, staleTime: Infinity },
    ),
  );
  const openedId = opened.state === 'ready' ? opened.data.id : null;

  useEffect(() => {
    if (token !== null) forgetInviteToken();
  }, [token]);

  const others = (invites: Invite[]) =>
    invites.filter((invite) => invite.id !== openedId);
  const listed = token === null ? 'Invites for you' : 'Your other invites';

  return (
    <div className={classes.page}>
      <PageTitle>Invites</PageTitle>
      <BodyText>
        Organisers invite people to a role at an org, a contest or a task, or to a place
        in a contest. Accepting takes what the invite offers; declining leaves things as
        they are.
      </BodyText>
      {token !== null && <OpenedInvite view={opened} />}
      <section className={classes.section}>
        <SectionTitle>{listed}</SectionTitle>
        {view.state === 'loading' && <PageSkeleton rows={2} />}
        {view.state === 'error' && (
          <ErrorBlock error={view.error} onRetry={view.retry} />
        )}
        {view.state === 'ready' &&
          (others(view.data).length === 0 ? (
            <BodyText tone="secondary">No invites are waiting for you.</BodyText>
          ) : (
            <InviteList label={listed} invites={others(view.data)} />
          ))}
      </section>
    </div>
  );
}
