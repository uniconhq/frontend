import { $api } from '@/api/query';
import { TextLink } from '@/ui/TextLink';
import { useSession } from './session-context';

/**
 * The way in for someone with no account yet. Renders nothing unless the
 * instance lets people register themselves, which the backend says by
 * answering GET register-url with a URL rather than null. Only asked once the
 * visitor is known to be signed out.
 */
export function CreateAccountLink() {
  const session = useSession();
  const register = $api.useQuery('get', '/api/v1/auth/register-url', undefined, {
    enabled: session.status === 'signed-out',
  });
  const url = register.data?.url ?? null;

  if (url === null) return null;
  return <TextLink href={url}>Create account</TextLink>;
}
