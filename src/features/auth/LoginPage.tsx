import { Navigate, useSearchParams } from 'react-router';
import { UniconLockup } from '@/ui/brand/UniconLockup';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { ApiError } from '@/api/problem';
import {
  CreateAccountLink,
  loginHref,
  safeNext,
  useForgeUrl,
  useSession,
} from '@/session';
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
  const forge = useForgeUrl();

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
              title: 'Sign in failed',
            })
          }
        />
      )}

      <div className={classes.actions}>
        <Button href={loginHref(next)}>
          {errorCode === null ? 'Sign in with Forgejo' : 'Try again'}
        </Button>
        <CreateAccountLink />
      </div>

      <BodyText tone="secondary">
        You will sign in through{' '}
        {forge === null ? 'Forgejo' : <a href={forge}>{new URL(forge).host}</a>}, where
        your account, your repositories and your submissions live.
      </BodyText>

      <BodyText tone="secondary">Unicon never sees your password.</BodyText>
    </div>
  );
}
