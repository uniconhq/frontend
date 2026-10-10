import type { GradingStatus, Outcome, SubmissionState } from '@/api/types';
import type { VerdictName } from '@/theme/theme';

/**
 * What each verdict is called and which of the handoff's six colour pairs it
 * takes, apart from the badge that draws it, so the words can be said where
 * no badge is drawn, such as to a screen reader.
 */

export type Verdict = Outcome | GradingStatus | SubmissionState;

const LOOK: Record<Verdict, { label: string; colors: VerdictName }> = {
  accepted: { label: 'ACCEPTED', colors: 'accepted' },
  wrong_answer: { label: 'WRONG ANSWER', colors: 'rejected' },
  time_limit: { label: 'TIME LIMIT', colors: 'limit' },
  memory_limit: { label: 'MEMORY LIMIT', colors: 'limit' },
  output_limit: { label: 'OUTPUT LIMIT', colors: 'limit' },
  runtime_error: { label: 'RUNTIME ERR', colors: 'rejected' },
  compile_error: { label: 'COMPILE ERR', colors: 'error' },
  skipped: { label: 'SKIPPED', colors: 'queued' },
  system_error: { label: 'SYSTEM ERR', colors: 'error' },
  queued: { label: 'QUEUED', colors: 'queued' },
  dispatched: { label: 'STARTING', colors: 'queued' },
  running: { label: 'RUNNING', colors: 'running' },
  done: { label: 'GRADED', colors: 'queued' },
  grading: { label: 'GRADING', colors: 'running' },
  graded: { label: 'GRADED', colors: 'queued' },
  cancelled: { label: 'CANCELLED', colors: 'queued' },
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
