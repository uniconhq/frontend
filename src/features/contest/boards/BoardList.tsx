import type { QueryView } from '@/api/query';
import type { Board } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Card } from '@/ui/Card';
import { BoardTable } from '@/ui/boards/BoardTable';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';

/**
 * Boards are computed on every read from what is shown, so they are read
 * again now and then: a grading that finishes, or a reveal, reaches the page
 * without a reload.
 */
export const BOARDS_EVERY_MS = 30_000;

/**
 * The boards the reader may see, in the order the contest's settings give
 * them, each on a card of its own. `empty` is said when there are none.
 */
export function BoardList({
  view,
  empty,
  submissionTo,
}: {
  view: QueryView<Board[]>;
  empty: string;
  submissionTo?: (task: string, number: number) => string;
}) {
  if (view.state === 'loading') return <PageSkeleton rows={3} />;
  if (view.state === 'error')
    return <ErrorBlock error={view.error} onRetry={view.retry} />;
  if (view.data.length === 0) return <BodyText tone="secondary">{empty}</BodyText>;
  return (
    <>
      {view.data.map((board) => (
        <Card key={board.board}>
          <BoardTable board={board} submissionTo={submissionTo} />
        </Card>
      ))}
    </>
  );
}
