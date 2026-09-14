import { useState } from 'react';
import { $api } from '@/api/query';
import { toApiError } from '@/api/problem';
import { describeError } from '@/api/describe-error';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { BodyText } from '@/ui/BodyText';
import { LinkButton } from '@/ui/LinkButton';
import { SectionTitle } from '@/ui/SectionTitle';
import { loginHref, useEndSession } from '@/session';
import { t } from '@/lib/t';
import { lastAdminScopes } from './last-admin';
import classes from './DangerZone.module.css';

type Action = 'deactivate' | 'delete';

const EXPLANATION: Record<Action, string> = {
  deactivate:
    'Your account is switched off in Forgejo: you cannot sign in or push until a platform admin turns it back on. Nothing is removed.',
  delete:
    'Your Forgejo account is removed. Your results stay on the leaderboards, attributed to "Deleted user", and your commits keep the name they were made with — git cannot scrub an author after the fact.',
};

const CONFIRM: Record<Action, string> = {
  deactivate: 'Deactivate account',
  delete: 'Delete account',
};

/**
 * Both are Forgejo operations underneath and both are irreversible from here,
 * so each states what survives before it asks. The backend demands a recent
 * sign in; that answer arrives as `reauth_required` and turns the dialog into a
 * second sign-in button rather than an error.
 */
export function DangerZone() {
  const [action, setAction] = useState<Action | null>(null);
  const endSession = useEndSession();

  const finish = () => endSession('/');

  const deactivate = $api.useMutation('post', '/api/v1/me/deactivate', {
    onSuccess: finish,
  });
  const remove = $api.useMutation('delete', '/api/v1/me', { onSuccess: finish });

  const mutation = action === 'delete' ? remove : deactivate;
  const error = action === null ? null : mutation.error;
  const apiError = error === null || error === undefined ? null : toApiError(error);
  const scopes = apiError?.code === 'last_admin' ? lastAdminScopes(apiError) : [];

  const close = () => {
    setAction(null);
    deactivate.reset();
    remove.reset();
  };

  return (
    <div className={classes.zone}>
      <SectionTitle>{t('Leaving')}</SectionTitle>
      <BodyText size="md">
        {t('Deactivating is reversible by a platform admin. Deleting is not.')}
      </BodyText>
      <div className={classes.actions}>
        <Button variant="secondary" onClick={() => setAction('deactivate')}>
          {t('Deactivate account')}
        </Button>
        <Button variant="danger" onClick={() => setAction('delete')}>
          {t('Delete account')}
        </Button>
      </div>

      <Modal
        opened={action !== null}
        onClose={close}
        title={t(CONFIRM[action ?? 'deactivate'])}
      >
        <div className={classes.dialog}>
          <BodyText size="md">{t(EXPLANATION[action ?? 'deactivate'])}</BodyText>

          {apiError !== null && (
            <div className={classes.problem}>
              <BodyText tone="secondary">{describeError(apiError).title}</BodyText>
              <BodyText tone="secondary">{describeError(apiError).message}</BodyText>
              {scopes.length > 0 && (
                <ul className={classes.scopes}>
                  {scopes.map((scope) => (
                    <li key={`${scope.org}/${scope.team}`}>
                      {scope.org} · {scope.team}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className={classes.actions}>
            {apiError?.code === 'reauth_required' ? (
              <LinkButton href={loginHref('/account')}>{t('Sign in again')}</LinkButton>
            ) : (
              <Button
                variant="danger"
                loading={mutation.isPending}
                onClick={() => mutation.mutate({})}
              >
                {t(CONFIRM[action ?? 'deactivate'])}
              </Button>
            )}
            <Button variant="secondary" onClick={close}>
              {t('Cancel')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
