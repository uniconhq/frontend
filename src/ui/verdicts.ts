import type { GradingStatus, Outcome, SubmissionState } from '@/api/types';
import type { VerdictName } from '@/theme/theme';
import { NOT_GIVEN } from './number/words';

/**
 * What each verdict is called and which colour pair it takes, apart from the
 * badge that draws it, so the words can be said where no badge is drawn, such
 * as to a screen reader. A grading that has finished takes a pair of its own,
 * one still waiting the grey, and one held up or ended without a result the
 * limit's amber, so the three never read alike.
 */

export type Verdict = Outcome | GradingStatus | SubmissionState;

const LOOK: Record<Verdict, { label: string; colors: VerdictName }> = {
  accepted: { label: 'ACCEPTED', colors: 'accepted' },
  wrong_answer: { label: 'WRONG ANSWER', colors: 'rejected' },
  time_limit: { label: 'TIME LIMIT', colors: 'limit' },
  memory_limit: { label: 'MEMORY LIMIT', colors: 'limit' },
  output_limit: { label: 'OUTPUT LIMIT', colors: 'limit' },
  runtime_error: { label: 'RUNTIME ERROR', colors: 'rejected' },
  compile_error: { label: 'COMPILE ERROR', colors: 'error' },
  // A run skipped as a part it reads was not given (6.1).
  skipped: { label: NOT_GIVEN.toUpperCase(), colors: 'queued' },
  system_error: { label: 'SYSTEM ERROR', colors: 'error' },
  queued: { label: 'QUEUED', colors: 'queued' },
  dispatched: { label: 'STARTING', colors: 'queued' },
  running: { label: 'RUNNING', colors: 'running' },
  done: { label: 'GRADED', colors: 'finished' },
  grading: { label: 'GRADING', colors: 'running' },
  graded: { label: 'GRADED', colors: 'finished' },
  submitted: { label: 'SUBMITTED', colors: 'queued' },
  delayed: { label: 'GRADING DELAYED', colors: 'limit' },
  cancelled: { label: 'CANCELLED', colors: 'limit' },
  over_limit: { label: 'OVER THE LIMIT', colors: 'limit' },
};

function isKnown(verdict: string): verdict is Verdict {
  return Object.hasOwn(LOOK, verdict);
}

export function lookOf(verdict: string): { label: string; colors: VerdictName } {
  return isKnown(verdict)
    ? LOOK[verdict]
    : { label: verdict.replaceAll('_', ' ').toUpperCase(), colors: 'queued' };
}

/** The words a verdict is shown in, for saying it where no badge is drawn. */
export function verdictLabel(verdict: Verdict | (string & {})): string {
  return lookOf(verdict).label;
}
