import { $api } from '@/api/query';
import { toApiError, type ApiError } from '@/api/problem';
import { armSessionExpiry } from './expired';
import { useEndSession } from './use-end-session';

/**
 * A 401 counts as signed out. Any other failure means the cookie still lives,
 * so the app stays signed in. The expiry modal is disarmed first for that 401.
 */
export function useLogout(): {
  signOut: () => Promise<void>;
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
    signOut: async () => {
      armSessionExpiry(false);
      try {
        await mutation.mutateAsync({});
      } catch (caught) {
        if (toApiError(caught).status !== 401) {
          armSessionExpiry(true);
          return;
        }
      }
      await endSession();
    },
  };
}
