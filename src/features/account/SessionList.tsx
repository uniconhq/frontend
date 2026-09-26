import { useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import { Button } from '@/ui/Button';
import { BodyText } from '@/ui/BodyText';
import { SectionTitle } from '@/ui/SectionTitle';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { useEndSession } from '@/session';
import { formatDateTime } from '@/lib/time';
import { t } from '@/lib/t';
import { describeUserAgent } from './user-agent';
import classes from './SessionList.module.css';

const SESSIONS_KEY = $api.queryOptions('get', '/api/v1/me/sessions').queryKey;

/**
 * Every session Unicon has issued for this person, with the one they are
 * reading it on marked. Revoking belongs here rather than in Forgejo, which
 * knows nothing about Unicon's cookies. Two of the buttons end the session
 * doing the clicking, so both take the same way out as the sign-out menu item.
 */
export function SessionList() {
  const queryClient = useQueryClient();
  const endSession = useEndSession();
  const view = queryView($api.useQuery('get', '/api/v1/me/sessions'));

  const revoke = $api.useMutation('delete', '/api/v1/me/sessions/{session_id}');
  const revokeAll = $api.useMutation('delete', '/api/v1/me/sessions');

  const revokeOne = async (sessionId: string, isCurrent: boolean) => {
    try {
      await revoke.mutateAsync({ params: { path: { session_id: sessionId } } });
    } catch {
      return;
    }
    if (isCurrent) {
      await endSession('/');
      return;
    }
    await queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
  };

  const revokeEverything = async () => {
    try {
      await revokeAll.mutateAsync({});
    } catch {
      return;
    }
    await endSession('/');
  };

  if (view.state === 'loading') return <PageSkeleton rows={2} />;
  if (view.state === 'error')
    return <ErrorBlock error={view.error} onRetry={view.retry} />;

  return (
    <div className={classes.sessions}>
      <SectionTitle order={3}>{t('Signed in on')}</SectionTitle>
      <ul className={classes.list}>
        {view.data.map((session) => (
          <li key={session.id} className={classes.row}>
            <div className={classes.details}>
              <div className={classes.device}>
                {describeUserAgent(session.user_agent)}
                {session.current && (
                  <span className={classes.current}>{t('This device')}</span>
                )}
              </div>
              <BodyText tone="secondary" mono>
                {t('signed in')} {formatDateTime(new Date(session.created_at))} ·{' '}
                {t('last seen')} {formatDateTime(new Date(session.last_seen_at))}
              </BodyText>
            </div>
            <span className={classes.action}>
              <Button
                size="xs"
                variant="secondary"
                disabled={revoke.isPending}
                onClick={() => void revokeOne(session.id, session.current)}
              >
                {session.current ? t('Sign out') : t('Revoke')}
              </Button>
            </span>
          </li>
        ))}
      </ul>

      {revoke.error !== null && <ErrorBlock error={revoke.error} />}
      {revokeAll.error !== null && <ErrorBlock error={revokeAll.error} />}

      <div>
        <Button
          variant="secondary"
          disabled={revokeAll.isPending}
          onClick={() => void revokeEverything()}
        >
          {t('Sign out everywhere')}
        </Button>
      </div>
    </div>
  );
}
