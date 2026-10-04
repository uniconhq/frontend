import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { leaveFor } from '@/lib/leave';
import { armSessionExpiry } from './expired';
import { fetchForgeUrl } from './forge';

/**
 * The forge's own sign-out. The proxy answers it by clearing Forgejo's sign-in
 * cookies and sending the browser back to the app's front page.
 */
const FORGE_SIGN_OUT = '/-/sign-out';

/**
 * What every way out of a session has to do, in the order that works: sign-out,
 * sign out everywhere, revoking the session you are reading this on, and
 * deactivating or deleting the account.
 *
 *   1. Disarm the expired-session modal. The 401s that follow are the ones we asked for.
 *   2. Know where Forgejo is before the cache that holds it is dropped.
 *   3. Leave the page, for the front page.
 *   4. Drop every answer the old session produced and ask again as nobody. resetQueries, not clear: clear leaves mounted observers holding their last answer, so the header goes on naming the person who has left.
 *   5. Sign the browser out of Forgejo too. The app signs people in through Forgejo, so a Forgejo sign-in left behind would sign the next person at this browser straight back in as this one, and would send Create account to this person's own account page. Only a backend that cannot say where Forgejo is skips this, and then the browser stays on the front page.
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
