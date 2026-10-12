import type { GradingResult } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { VerdictBadge } from '@/ui/VerdictBadge';
import {
  DELAYED_SENTENCE,
  cancelReason,
  overLimitSentence,
  verdictOf,
} from './grading';

/**
 * A submission's verdict as one badge, or a line saying it has no grading. A
 * submission the organisers cancelled shows their sentence under the badge,
 * and a delayed one, or one past the task's limit, says what that means.
 */
export function Verdict({ grading }: { grading: GradingResult | null }) {
  if (grading === null) return <BodyText tone="secondary">Not graded</BodyText>;
  return (
    <>
      <VerdictBadge verdict={verdictOf(grading)} />
      {grading.status === 'delayed' && (
        <BodyText tone="secondary">{DELAYED_SENTENCE}</BodyText>
      )}
      {grading.status === 'over_limit' && (
        <BodyText tone="secondary">{overLimitSentence(grading.limit)}</BodyText>
      )}
      {cancelReason(grading) !== null && (
        <BodyText tone="secondary">{cancelReason(grading)}</BodyText>
      )}
    </>
  );
}
