import { useState } from 'react';
import { $api } from '@/api/query';
import { toApiError } from '@/api/problem';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { BodyText } from '@/ui/BodyText';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { SectionTitle } from '@/ui/SectionTitle';
import { loginHref, useEndSession } from '@/session';
import { t } from '@/lib/t';
import { soleAdminScopes } from './sole-admin';
import { sharedWorkflows } from './shared-workflows';
import classes from './DangerZone.module.css';

type Action = 'deactivate' | 'delete';

const EXPLANATION: Record<Action, string> = {
  deactivate:
    'Your account is switched off in Forgejo, so you cannot sign in or push until a platform admin turns it back on. A platform admin can undo this.',
  delete:
    'Your Forgejo account is removed. Your results stay on the leaderboards as "Deleted user" and your commits keep the name they were made with. This cannot be undone.',
};

const CONFIRM: Record<Action, string> = {
  deactivate: 'Deactivate account',
  delete: 'Delete account',
};

/**
 * Both are Forgejo operations underneath, so each states what it does and
 * whether it can be undone before it asks. A refusal is shown as it came: the
 * scopes where this person is the only admin, or the workflows other people
 * still use. The backend demands a recent sign in; that answer arrives as
 * `fresh_sign_in_required` and turns the dialog into a second sign-in button
 * rather than an error.
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
  const scopes = apiError?.code === 'sole_admin' ? soleAdminScopes(apiError) : [];
  const workflows =
    apiError?.code === 'shared_workflow_owner' ? sharedWorkflows(apiError) : [];

  const close = () => {
    setAction(null);
    deactivate.reset();
    remove.reset();
  };

  return (
    <div className={classes.zone}>
      <SectionTitle>{t('Leaving')}</SectionTitle>
      <BodyText size="md">
        {t('Deactivating can be undone by a platform admin. Deleting cannot.')}
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
              <ErrorBlock error={apiError} compact />
              {scopes.length > 0 && (
                <ul className={classes.named}>
                  {scopes.map((scope) => (
                    <li key={`${scope.kind}:${scope.name}`}>
                      {scope.name} ({scope.kind})
                    </li>
                  ))}
                </ul>
              )}
              {workflows.length > 0 && (
                <ul className={classes.named}>
                  {workflows.map((workflow) => (
                    <li key={workflow}>{workflow}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className={classes.actions}>
            {apiError?.code === 'fresh_sign_in_required' ? (
              <Button href={loginHref('/account')}>{t('Sign in again')}</Button>
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
