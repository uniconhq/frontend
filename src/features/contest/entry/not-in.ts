import type { ContestHome } from '@/api/types';

/** Why a person who is not an approved entrant cannot submit or ask yet. */
export type NotIn = 'organises' | 'waiting' | 'may_register' | 'out';

export function notIn(home: Pick<ContestHome, 'organises' | 'registration'>): NotIn {
  if (home.organises) return 'organises';
  if (home.registration.entrant?.status === 'pending') return 'waiting';
  return home.registration.can_register ? 'may_register' : 'out';
}

export const TASK_STANDING: Record<NotIn, string> = {
  organises: 'Open to entrants',
  waiting: 'Open once your registration is approved',
  may_register: 'Register to submit',
  out: 'Open to the contest’s entrants only',
};

export const ASK_WORDS: Record<Exclude<NotIn, 'organises'>, string> = {
  waiting: 'You can ask the organisers questions once your registration is approved.',
  may_register:
    'You can ask the organisers questions once you register for the contest, on its page.',
  out: 'Only the contest’s entrants can ask the organisers questions.',
};

export const SUBMIT_WORDS: Record<NotIn, string> = {
  organises: 'You organise this contest, so you do not submit to its tasks.',
  waiting: 'You can submit once your registration is approved.',
  may_register: 'You can submit once you register for the contest, on its page.',
  out: 'Only the contest’s entrants can submit to this task.',
};
