import type { ApiError } from './problem';

/**
 * One place that turns a stable error code into words. Pages render the
 * sentence, never the code: `session_expired` means nothing to a contestant.
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
    case 'fresh_sign_in_required':
      return {
        title: 'Sign in again to confirm',
        message: 'This step needs a recent sign in, because it cannot be undone.',
      };
    case 'forbidden':
      return {
        title: 'You cannot do that',
        message: error.detail ?? 'Your account does not have the role this needs.',
      };
    case 'origin_mismatch':
      return {
        title: 'That request came from the wrong place',
        message: 'Reload the page and try again.',
      };
    case 'forge_unavailable':
      return {
        title: 'Forgejo did not answer',
        message:
          'Reading works; signing in, submitting and posting will resume when it is back.',
      };
    case 'forge_misconfigured':
      return {
        title: 'Forgejo is not set up for Unicon',
        message:
          'A platform admin has to fix the connection before anyone can sign in.',
      };
    case 'sign_in_invalid':
      return {
        title: 'That sign in expired',
        message: 'The sign in took too long or was started in another tab.',
      };
    case 'sign_in_denied':
      return {
        title: 'Sign in was not approved',
        message: 'You did not approve the sign in.',
      };
    case 'sign_in_failed':
      return {
        title: 'Sign in failed',
        message: 'Something went wrong on the way back from Forgejo. Try again.',
      };
    case 'rejected':
      return {
        title: 'Forgejo refused the change',
        message: error.detail ?? 'Forgejo would not make this change.',
      };
    case 'sole_admin':
      return {
        title: 'You are the only admin somewhere',
        message: 'Someone else has to take the role before you can do this.',
      };
    case 'shared_workflow_owner':
      return {
        title: 'You own workflows other people use',
        message: 'Hand them to someone else before you can do this.',
      };
    case 'conflict':
      return {
        title: 'That clashes with something already there',
        message: error.detail ?? 'Reload the page to see the current state.',
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
    case 'internal_error':
      return {
        title: 'Unicon hit a problem',
        message: 'Nothing you did caused it. Try again in a moment.',
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
