import { Navigate, useSearchParams } from 'react-router';
import { UniconLockup } from '@/ui/brand/UniconLockup';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { $api } from '@/api/query';
import { ApiError } from '@/api/problem';
import { loginHref, safeNext, useSession } from '@/session';
import { FORGE_HOST, FORGE_URL } from '@/lib/config';
import { t } from '@/lib/t';
import { loginErrorCode } from './login-errors';
import classes from './LoginPage.module.css';

/**
 * One button, no form. Unicon has no password to check: the button is a
 * full-page navigation to the backend, which sends the browser to Forgejo. The
 * page also exists for deep links to land on, which is why it handles `?error=`
 * from the callback.
 */
export function LoginPage() {
  const [params] = useSearchParams();
  const session = useSession();
  const next = safeNext(params.get('next'));
  const errorCode = loginErrorCode(params.get('error'));

  const register = $api.useQuery('get', '/api/v1/auth/register-url');
  const registerUrl = register.data?.url ?? null;

  if (session.status === 'signed-in') return <Navigate to={next} replace />;

  return (
    <div className={classes.page}>
      <UniconLockup size={40} />

      {errorCode !== null && (
        <ErrorBlock
          error={
            new ApiError({
              code: errorCode,
              status: 400,
              title: t('Sign in failed'),
            })
          }
        />
      )}

      <div className={classes.actions}>
        <Button href={loginHref(next)}>
          {errorCode === null ? t('Sign in with Forgejo') : t('Try again')}
        </Button>
        {registerUrl !== null && (
          <a href={registerUrl}>
            <BodyText tone="secondary">{t('Create account')}</BodyText>
          </a>
        )}
      </div>

      <BodyText tone="secondary">
        {t('You will sign in through')} <a href={FORGE_URL}>{FORGE_HOST}</a>
        {t(', where your account, your repositories and your submissions live.')}
      </BodyText>

      <BodyText tone="secondary">{t('Unicon never sees your password.')}</BodyText>
    </div>
  );
}
