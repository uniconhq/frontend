import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { leaveFor } from '@/lib/leave';
import { armSessionExpiry } from './expired';
import { fetchForgeUrl } from './forge';

// The proxy clears Forgejo's cookies and sends the browser to the front page.
const FORGE_SIGN_OUT = '/-/sign-out';

/**
 * Order matters: read the Forgejo URL before the cache goes. resetQueries, not
 * clear, so mounted reads drop the old person. Forgejo is signed out too, or
 * it would sign the next person straight back in.
 */
export function useEndSession(): () => Promise<void> {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return async () => {
    armSessionExpiry(false);
    const forge = await fetchForgeUrl(queryClient);
    await navigate('/');
    await queryClient.resetQueries();
    if (forge !== null) leaveFor(`${forge}${FORGE_SIGN_OUT}`);
  };
}
