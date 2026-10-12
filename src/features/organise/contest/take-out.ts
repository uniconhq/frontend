import type { TakeOut, TaskStanding } from '@/api/types';

/**
 * Where taking a task out of its contest stands in its dialog (#450): asking
 * whether to remove or withdraw it, as the task list said it would be, with
 * what changed since when the forge says so; asking whether to put a
 * withdrawn one back; or put back, with what the leaderboards report.
 */
export type TakingOut =
  | { step: 'take-out'; would: TakeOut; submissions: number; changed: boolean }
  | { step: 'put-back' }
  | { step: 'back'; notes: string[] };

/** What taking `standing` out of its contest would do, as its row says now. */
export function takingOutOf(standing: TaskStanding): TakingOut {
  return standing.withdrawn || standing.take_out === null
    ? { step: 'put-back' }
    : {
        step: 'take-out',
        would: standing.take_out,
        submissions: standing.submissions,
        changed: false,
      };
}

/** The dialog's question while taking a task out or putting it back. */
export function takingOutTitle(asking: TakingOut, label: string): string {
  if (asking.step === 'put-back') return `Put ${label} back in the contest?`;
  if (asking.step === 'back') return `${label} is back in the contest`;
  return asking.would === 'remove'
    ? `Remove ${label} from the contest?`
    : `Withdraw ${label} from the contest?`;
}
