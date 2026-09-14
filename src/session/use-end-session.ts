import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { armSessionExpiry } from './expired';

/**
 * What every way out of a session has to do, in the order that works: sign-out,
 * sign out everywhere, revoking the session you are reading this on, and
 * deactivating or deleting the account.
 *
 *   1. Disarm the expired-session modal. The 401s that follow are the ones we asked for.
 *   2. Leave the page.
 *   3. Drop every answer the old session produced and ask again as nobody. resetQueries, not clear: clear leaves mounted observers holding their last answer, so the header goes on naming the person who has left.
 */
export function useEndSession(): (to?: string) => Promise<void> {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return async (to = '/') => {
    armSessionExpiry(false);
    await navigate(to);
    await queryClient.resetQueries();
  };
}
