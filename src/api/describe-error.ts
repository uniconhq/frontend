import { formatLimit } from '@/lib/size';
import { formatTimeOfDay, serverNow } from '@/lib/time';
import type { ApiError } from './problem';

/**
 * One place that turns a stable error code into words. Pages render the
 * sentence, never the code: `session_expired` means nothing to a contestant.
 */
export type ErrorDescription = { title: string; message: string };

/** A member of the refusal that is a number, such as a limit. */
function numberOf(error: ApiError, member: string): number | null {
  const value = error.extensions[member];
  return typeof value === 'number' ? value : null;
}

/** A member of the refusal that is text, such as a reason. */
function textOf(error: ApiError, member: string): string | null {
  const value = error.extensions[member];
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * When a rate-limited submit may be sent again, read against the server's
 * clock, since `retry_at` is the server's time.
 */
function againAt(error: ApiError): string {
  const at = textOf(error, 'retry_at');
  const due = at === null ? Number.NaN : Date.parse(at);
  if (Number.isNaN(due)) return 'Wait a little and submit again.';
  if (due <= serverNow().getTime()) return 'You can submit again now.';
  return `You can submit again at ${formatTimeOfDay(new Date(due))}.`;
}

function tooLarge(error: ApiError): ErrorDescription {
  const limit = numberOf(error, 'limit');
  if (textOf(error, 'input') !== null) {
    return {
      title: 'That file is too large',
      message:
        limit === null
          ? 'A file for this input is larger than it takes.'
          : `A file for this input may be at most ${formatLimit(limit)}.`,
    };
  }
  return {
    title: 'That submission is too large',
    message:
      limit === null
        ? 'The files together are larger than the task takes.'
        : `A submission may be at most ${formatLimit(limit)} in all.`,
  };
}

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
    case 'invalid_name':
      return {
        title: 'That name will not do',
        message: error.detail ?? 'Pick a different name.',
      };
    case 'confirmation_required':
      return {
        title: 'This changes how the task grades',
        message:
          error.detail ??
          'The contest is running, so a change to grading has to be confirmed.',
      };
    case 'admin_only':
      return {
        title: 'Only an admin can change that',
        message: error.detail ?? 'Ask an admin of this scope to make the change.',
      };
    case 'reserved_path':
      return {
        title: 'Unicon writes those files itself',
        message: error.detail ?? 'Files under plans/ come from the save, not by hand.',
      };
    case 'invalid_definition':
      return {
        title: 'The settings file has errors',
        message: error.detail ?? 'Nothing was saved. Fix the errors and save again.',
      };
    case 'invalid_path':
      return {
        title: 'That path cannot be used',
        message: error.detail ?? 'A path stays inside the repo and names a file.',
      };
    case 'registration_closed':
      return {
        title: 'Registration is closed',
        message: error.detail ?? 'This contest is not taking registrations right now.',
      };
    case 'is_staff':
      return {
        title: 'You organise this contest',
        message: 'Someone with a role in a contest cannot also enter it.',
      };
    case 'invite_required':
      return {
        title: 'This contest is by invitation',
        message: 'Only people the organisers invite may register.',
      };
    case 'wrong_invite_code':
      return {
        title: 'That code is not right',
        message: 'Check the code the organisers gave you and try again.',
      };
    case 'domain_not_allowed':
      return {
        title: 'Your email address is not accepted',
        message:
          'This contest takes only some email addresses. Change yours in your account if you have another.',
      };
    case 'already_registered':
      return {
        title: 'You have registered already',
        message: 'Reload the page to see where your registration stands.',
      };
    case 'contest_full':
      return {
        title: 'The contest is full',
        message: 'Every place is taken.',
      };
    case 'wrong_status':
      return {
        title: 'That registration has moved on',
        message: error.detail ?? 'Reload the list to see where it stands now.',
      };
    case 'invalid_reason':
      return {
        title: 'That reason will not do',
        message:
          error.detail ??
          'The person reads it, so give one of at most 1000 characters.',
      };
    case 'invalid_extension':
      return {
        title: 'That extension will not do',
        message: error.detail ?? 'Give between no time and a year.',
      };
    case 'task_closed':
      return textOf(error, 'reason') === 'submissions_closed'
        ? {
            title: 'Submissions are closed',
            message: 'The organisers have closed submissions for this contest.',
          }
        : {
            title: 'The contest has ended for you',
            message: 'This task takes no more submissions from you.',
          };
    case 'archived':
      return {
        title: 'The contest is archived',
        message: 'Its tasks can still be read, and they take no submissions.',
      };
    case 'not_approved':
      return {
        title: 'You are not a contestant here yet',
        message:
          "Only an approved contestant submits. The contest's page says where your registration stands.",
      };
    case 'workspace_not_ready':
      return {
        title: 'Your workspace is still being made',
        message: 'It takes a moment. Submit again once it is ready.',
      };
    case 'submission_limit': {
      const limit = numberOf(error, 'limit');
      return {
        title: 'You have used every submission',
        message:
          limit === null
            ? 'You have made every submission this task takes.'
            : `This task takes ${limit} submissions in all, and you have made them.`,
      };
    }
    case 'rate_limited':
      return {
        title: 'That is too soon after your last submission',
        message: againAt(error),
      };
    case 'too_large':
      return tooLarge(error);
    case 'upload_not_yours':
      return {
        title: 'A file is not one you uploaded',
        message: 'Nothing was submitted. Choose the files again and submit.',
      };
    case 'upload_not_ready':
      return {
        title: 'A file did not arrive whole',
        message: 'Nothing was submitted. Submit again and the files are sent again.',
      };
    case 'upload_limit':
      return {
        title: 'Too many files are waiting to be submitted',
        message:
          'Files you uploaded and did not submit count until they are cleared, two days after they were sent. Submit what you have, or try again later.',
      };
    case 'log_too_large':
      return {
        title: 'The log is too large to show',
        message: 'The verdict above is what the grading found.',
      };
    case 'invalid_inputs':
      return {
        title: 'The submission does not fit the task',
        message: 'Nothing was submitted. Fix what is listed and submit again.',
      };
    case 'invalid_idempotency_key':
      return {
        title: 'That submit could not be sent',
        message: 'Reload the page and submit again.',
      };
    case 'upload_failed':
      return {
        title: 'The upload did not go through',
        message:
          'The file may be larger than the store takes, or the connection dropped. Nothing was submitted.',
      };
    case 'upload_rejected':
      return {
        title: 'A file did not arrive as it was sent',
        message: 'What arrived is not the size of the file. Nothing was submitted.',
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
