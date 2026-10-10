import type { GradingResult } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { VerdictBadge } from '@/ui/VerdictBadge';
import { cancelReason, verdictOf } from './grading';

/**
 * A submission's verdict as one badge, or a line saying it has no grading. A
 * submission the organisers cancelled shows their sentence under the badge.
 */
export function Verdict({ grading }: { grading: GradingResult | null }) {
  if (grading === null) return <BodyText tone="secondary">Not graded</BodyText>;
  return (
    <>
      <VerdictBadge verdict={verdictOf(grading)} />
      {cancelReason(grading) !== null && (
        <BodyText tone="secondary">{cancelReason(grading)}</BodyText>
      )}
    </>
  );
}
