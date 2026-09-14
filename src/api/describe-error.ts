import type { ApiError } from './problem';

/**
 * One place that turns a stable error code into words. Pages render the
 * sentence, never the code: `forge_reauth` means nothing to a contestant.
 */
export type ErrorDescription = { title: string; message: string };

export function describeError(error: ApiError): ErrorDescription {
  switch (error.code) {
    case 'unauthenticated':
    case 'session_expired':
      return {
        title: 'Your session ended',
        message: 'Sign in again to carry on.',
      };
    case 'forge_reauth':
      return {
        title: 'Forgejo needs you to sign in again',
        message: 'Unicon can no longer act for you in Forgejo. Signing in restores it.',
      };
    case 'reauth_required':
      return {
        title: 'Sign in again to confirm',
        message: 'This step needs a fresh sign in, because it cannot be undone.',
      };
    case 'origin_mismatch':
      return {
        title: 'That request came from the wrong place',
        message: 'Reload the page and try again.',
      };
    case 'forge_unreachable':
      return {
        title: 'Forgejo did not answer',
        message:
          'Reading works; signing in, submitting and posting will resume when it is back.',
      };
    case 'login_state_invalid':
      return {
        title: 'That sign in expired',
        message: 'The sign in took too long or was started in another tab.',
      };
    case 'login_denied':
      return {
        title: 'Sign in was not approved',
        message: 'You did not approve the sign in.',
      };
    case 'login_failed':
      return {
        title: 'Sign in failed',
        message: 'Something went wrong on the way back from Forgejo. Try again.',
      };
    case 'forge_rejected':
      return {
        title: 'Forgejo refused the change',
        message: error.detail ?? 'Forgejo would not make this change.',
      };
    case 'last_admin':
      return {
        title: 'You are the last admin somewhere',
        message: 'Someone else has to take the role before you can do this.',
      };
    case 'not_found':
      return {
        title: 'Not found',
        message: 'It may have been removed, or the address may be wrong.',
      };
    case 'validation_error':
      return {
        title: 'That did not look right',
        message: error.detail ?? 'Check the values and try again.',
      };
    case 'network_error':
      return {
        title: 'Cannot reach Unicon',
        message:
          'Your work is kept in this tab. This page will work again when it is back.',
      };
    default:
      return {
        title: error.title,
        message: error.detail ?? 'Something went wrong. Try again in a moment.',
      };
  }
}
