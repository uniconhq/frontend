import { $api } from '@/api/query';
import { OutLink } from '@/ui/OutLink';
import { useSession } from './session-context';

/** Shown only when the server gives a register URL (self sign-up is on). */
export function CreateAccountLink() {
  const session = useSession();
  const register = $api.useQuery('get', '/api/v1/auth/register-url', undefined, {
    enabled: session.status === 'signed-out',
  });
  const url = register.data?.url ?? null;

  if (url === null) return null;
  return <OutLink href={url}>Create account</OutLink>;
}
