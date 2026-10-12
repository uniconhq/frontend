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
  return {
    title: 'Too large for this input',
    message:
      limit === null
        ? 'The files for this input are larger than it takes.'
        : `The files for this input may be at most ${formatLimit(limit)} in all.`,
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
        title: 'You are the only admin of an org, contest or task',
        message: 'Give someone else the admin role there before you do this.',
      };
    case 'contestant_conflict':
      return {
        title: 'They have entered this contest',
        message:
          error.detail ??
          'Someone who has entered a contest cannot also organise it. Their entry has to be removed first.',
      };
    case 'shared_workflow_owner':
      return {
        title: 'You own workflows other people use',
        message: 'Hand them to someone else before you can do this.',
      };
    case 'conflict':
      return {
        title: 'That conflicts with something already there',
        message: error.detail ?? 'Reload the page to see the current state.',
      };
    case 'invalid_name':
      return {
        title: 'That name cannot be used',
        message: error.detail ?? 'Choose a different name.',
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
        message: error.detail ?? 'Ask an admin here to make the change.',
      };
    case 'reserved_path':
      return {
        title: 'Unicon writes those files itself',
        message:
          error.detail ??
          'Files in the plans folder are written each time the task is saved, not by hand.',
      };
    case 'invalid_definition':
      return {
        title: 'Nothing was saved',
        message: 'Some settings have problems. Fix each one listed and save again.',
      };
    case 'invalid_path':
      return {
        title: 'That path cannot be used',
        message:
          error.detail ??
          'Give a folder and file name inside the task, such as public/diagram.png.',
      };
    case 'registration_closed':
      return {
        title: 'Registration is closed',
        message: error.detail ?? 'This contest is not taking registrations right now.',
      };
    case 'is_staff':
      return {
        title: 'You organise this contest',
        message: 'Organisers of a contest cannot also enter it.',
      };
    case 'invite_required':
      return {
        title: 'This contest is by invite only',
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
        message: 'Every place its organisers allowed is taken.',
      };
    case 'wrong_status':
      return {
        title: 'That has changed meanwhile',
        message: error.detail ?? 'Reload the list to see where it stands now.',
      };
    case 'invalid_invite':
      return {
        title: 'That invite cannot be made',
        message: error.detail ?? 'Check who it is for and what it offers.',
      };
    case 'already_invited':
      return {
        title: 'They have this invite already',
        message: 'It is in the list of invites, where it can be sent again.',
      };
    case 'invite_expired':
      return {
        title: 'This invite has expired',
        message: 'Ask the organisers to send a new one.',
      };
    case 'invalid_reason':
      return {
        title: 'That reason cannot be used',
        message:
          error.detail ?? 'The person reads it, so keep it to at most 1000 characters.',
      };
    case 'invalid_extension':
      return {
        title: 'That extra time cannot be used',
        message: error.detail ?? 'Give from 0 minutes up to a year.',
      };
    case 'entrants_alone':
      return {
        title: 'Everyone enters this contest alone',
        message: 'Nobody is invited into a team here, and a registration has no name.',
      };
    case 'invalid_entrant_name':
      return {
        title: 'That name cannot be used',
        message: error.detail ?? 'A name is 1 to 60 characters of ordinary text.',
      };
    case 'entrant_name_required':
      return {
        title: 'Give your team a name',
        message: 'People enter this contest in teams, and each team has a name.',
      };
    case 'entrant_name_taken':
      return {
        title: 'That name is taken',
        message: 'Another team in this contest has it. Choose a different name.',
      };
    case 'entrant_full': {
      const limit = numberOf(error, 'limit');
      return {
        title: 'The team is full',
        message:
          limit === null
            ? 'Its members and the people invited into it already fill it.'
            : `A team in this contest holds at most ${String(limit)}, counting the people invited into it.`,
      };
    }
    case 'in_entrant':
      return {
        title: 'Already in a team here',
        message:
          error.detail ??
          'A person is in one team per contest, and can leave it only before the team submits or is fixed.',
      };
    case 'roster_locked':
      return {
        title: 'The team is fixed now',
        message:
          'Who is in it no longer changes, except by the organisers. Ask them if someone has to join or leave.',
      };
    case 'entrant_incomplete': {
      const fewest = numberOf(error, 'fewest');
      return {
        title: 'The team is not complete',
        message:
          fewest === null
            ? 'It needs more people before it can be approved or submit.'
            : `A team in this contest needs at least ${String(fewest)} people before it can be approved or submit.`,
      };
    }
    case 'no_invite_way':
      return {
        title: 'This contest has no way in by invite',
        message:
          'Add “People you invite” under How people enter first, so an invite lets someone in.',
      };
    case 'entrant_has_submissions':
      return {
        title: 'This team has submitted',
        message: error.detail ?? 'A team that has submitted stays with its results.',
      };
    case 'entrant_changed':
      return {
        title: 'Your team changed meanwhile',
        message: 'Someone changed who is in it while this was being done. Try again.',
      };
    case 'task_closed':
      return {
        title: 'This task has closed for you',
        message: 'It takes no more submissions from you.',
      };
    case 'task_withdrawn':
      return {
        title: 'This task was withdrawn',
        message:
          'The organisers took it out of the contest, so it takes no submissions. Nothing was submitted.',
      };
    case 'take_out_changed':
      return {
        title: 'Someone submitted meanwhile',
        message:
          error.detail ??
          'The task’s submissions changed since this was asked. Look again and try again.',
      };
    case 'take_out_refused':
      return {
        title: 'The task cannot be taken out as things stand',
        message: error.detail ?? 'Check the contest’s leaderboards and settings first.',
      };
    case 'archived':
      return {
        title: 'The contest is archived',
        message: 'Its tasks can still be read, and they take no submissions.',
      };
    case 'not_approved':
      return {
        title: 'Your registration is not approved yet',
        message:
          error.detail ??
          "Only an approved entrant can submit. The contest's page says where your registration stands.",
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
    case 'marks_off':
      return {
        title: 'This task takes no marks',
        message: 'No leaderboard of the contest counts the submissions you mark on it.',
      };
    case 'marks_frozen':
      return {
        title: 'Your marks are final',
        message: 'This task has closed for you, so its marks no longer change.',
      };
    case 'mark_limit': {
      const limit = numberOf(error, 'limit');
      return {
        title: 'You have marked as many as you can',
        message:
          limit === null
            ? 'Take a mark off another submission first.'
            : `This task counts at most ${limit} marked ${limit === 1 ? 'submission' : 'submissions'}. Take a mark off another first.`,
      };
    }
    case 'upload_not_yours':
      return {
        title: 'A file is not one you uploaded',
        message: 'Nothing was submitted. Choose the files again and submit.',
      };
    case 'upload_not_ready':
      return {
        title: 'A file did not arrive in full',
        message: 'Nothing was submitted. Submit again to send the files again.',
      };
    case 'upload_limit':
      return {
        title: 'Too many files are waiting to be submitted',
        message:
          'Files you uploaded and did not submit count until they are cleared, two days after they were sent. Submit what you have, or try again later.',
      };
    case 'invalid_inputs':
      return {
        title: 'The submission does not fit the task',
        message: 'Nothing was submitted. Fix what is listed and submit again.',
      };
    case 'invalid_idempotency_key':
      return {
        title: 'That submission could not be sent',
        message: 'Reload the page and submit again.',
      };
    case 'upload_failed':
      return {
        title: 'The upload did not go through',
        message:
          'The file may have changed since it was chosen, or the connection dropped. Nothing was submitted.',
      };
    case 'upload_rejected':
      return {
        title: 'A file did not arrive as it was sent',
        message:
          'Unicon did not receive the file as it was sent. Send it again. Nothing was submitted.',
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
        title: 'Unicon ran into a problem',
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
