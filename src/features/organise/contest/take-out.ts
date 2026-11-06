import type { TakeOut, TaskStanding } from '@/api/types';

/** The take-out dialog's steps (#450). `changed` is set once the forge says the task moved on. */
export type TakingOut =
  | { step: 'take-out'; would: TakeOut; submissions: number; changed: boolean }
  | { step: 'put-back' }
  | { step: 'back'; notes: string[] };

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

export function takingOutTitle(asking: TakingOut, label: string): string {
  if (asking.step === 'put-back') return `Put ${label} back in the contest?`;
  if (asking.step === 'back') return `${label} is back in the contest`;
  return asking.would === 'remove'
    ? `Remove ${label} from the contest?`
    : `Withdraw ${label} from the contest?`;
}
