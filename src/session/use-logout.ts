import { $api } from '@/api/query';
import { toApiError, type ApiError } from '@/api/problem';
import { armSessionExpiry } from './expired';
import { useEndSession } from './use-end-session';

/**
 * Signing out is one request and then everything in `useEndSession`. A session
 * that is already gone (401) is the outcome we wanted; any other answer means
 * the cookie is still alive, and a signed-out page over a live session must not
 * happen, so the app stays as it is and says why.
 *
 * The modal is disarmed before the request rather than after: a 401 to this
 * request is the answer we asked for.
 */
export function useLogout(): {
  signOut: (to?: string) => Promise<void>;
  clearError: () => void;
  pending: boolean;
  error: ApiError | null;
} {
  const endSession = useEndSession();
  const mutation = $api.useMutation('post', '/api/v1/auth/logout');

  return {
    pending: mutation.isPending,
    error: mutation.error === null ? null : toApiError(mutation.error),
    clearError: () => {
      mutation.reset();
    },
    signOut: async (to = '/') => {
      armSessionExpiry(false);
      try {
        await mutation.mutateAsync({});
      } catch (caught) {
        if (toApiError(caught).status !== 401) {
          armSessionExpiry(true);
          return;
        }
      }
      await endSession(to);
    },
  };
}
