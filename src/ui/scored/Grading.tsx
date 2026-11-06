import { Group } from '@mantine/core';
import type { GradingResult } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { VerdictBadge } from '@/ui/VerdictBadge';
import { ScoredResult, type TextAsk } from './ScoredResult';
import type { ReadFiles } from './ShownInputs';
import { DELAYED_SENTENCE, cancelReason, overLimitSentence } from './scored-text';

/**
 * What the grading holds for the entrant: its verdict, the values and runs
 * the task shows, and what its steps done once reported, such as a compile
 * log. A grading the organisers cancelled holds their sentence instead,
 * and says the submission no longer counts against the task's limit: a cancel
 * with a sentence is the one the forge leaves out of the limit, so one
 * without (made before cancels carried one) says nothing about the limit. A
 * delayed one says its grading failed on Unicon's side, then shows the runs
 * it did give and its values, one reading a failed run "being checked"; one
 * over the limit, that it was not graded and why (#445).
 */
export function Grading({
  grading,
  readText,
  readFiles,
}: {
  grading: GradingResult;
  readText?: (ask: TextAsk) => Promise<string>;
  readFiles?: ReadFiles;
}) {
  if (grading.status === 'delayed') {
    return (
      <>
        <Group gap={8}>
          <VerdictBadge verdict="delayed" />
        </Group>
        <BodyText>{DELAYED_SENTENCE}</BodyText>
        <ScoredResult grading={grading} readText={readText} readFiles={readFiles} />
      </>
    );
  }
  if (grading.status === 'over_limit') {
    return (
      <>
        <Group gap={8}>
          <VerdictBadge verdict="over_limit" />
        </Group>
        <BodyText>{overLimitSentence('you', grading.limit)}</BodyText>
        <BodyText tone="secondary">
          It has no result and counts on no leaderboard.
        </BodyText>
      </>
    );
  }
  if (grading.status === 'cancelled') {
    const reason = cancelReason(grading);
    return (
      <>
        <Group gap={8}>
          <VerdictBadge verdict="cancelled" />
        </Group>
        <BodyText>
          Cancelled by the organisers{reason === null ? '.' : `: ${reason}`}
        </BodyText>
        {reason !== null && (
          <BodyText tone="secondary">
            It is not graded, and it does not count against the task&apos;s limit on
            submissions.
          </BodyText>
        )}
      </>
    );
  }
  return (
    <>
      <Group gap={8}>
        <VerdictBadge verdict={grading.status} />
        {/* Entrants' pages speak of a submission, not of its gradings' attempts. */}
        {grading.attempt > 1 && <BodyText tone="secondary">Graded again</BodyText>}
      </Group>
      <ScoredResult grading={grading} readText={readText} readFiles={readFiles} />
    </>
  );
}
