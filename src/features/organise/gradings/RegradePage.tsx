import { useParams } from 'react-router';
import { $api, queryView } from '@/api/query';
import type { components } from '@/api/schema';
import { BodyText } from '@/ui/BodyText';
import { Page, PageHeader } from '@/ui/Page';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { MISSING } from '@/ui/number/words';
import { useContestParams } from '@/lib/route-params';

type Diff = components['schemas']['LeaderboardDiff'];
type Change = components['schemas']['SubmissionChange'];

const READ = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/regrades/{regrade}';

/** One regrade: each leaderboard after it, and how far each row moved. */
export function RegradePage() {
  const { org, contest } = useContestParams();
  const { task, regrade } = useParams();
  if (task === undefined || regrade === undefined) return null;
  return <Regrade org={org} contest={contest} task={task} regrade={regrade} />;
}

function Regrade({
  org,
  contest,
  task,
  regrade,
}: {
  org: string;
  contest: string;
  task: string;
  regrade: string;
}) {
  const view = queryView(
    $api.useQuery('get', READ, { params: { path: { org, contest, task, regrade } } }),
  );
  if (view.state === 'loading') return <PageSkeleton />;
  if (view.state === 'error')
    return <ErrorBlock error={view.error} onRetry={view.retry} />;
  const boards = view.data.leaderboards;
  return (
    <Page>
      <PageHeader title="Regrade" />
      {view.data.running > 0 && (
        <BodyText tone="secondary">{`${String(view.data.running)} still running.`}</BodyText>
      )}
      {view.data.unread > 0 && (
        <BodyText tone="secondary">{`${String(view.data.unread)} cannot be compared.`}</BodyText>
      )}
      {boards !== null && boards.length === 0 && (
        <BodyText tone="secondary">No leaderboard reads this task.</BodyText>
      )}
      {boards !== null &&
        boards.map((board) => <BoardDiff key={board.leaderboard} board={board} />)}
      <Changes
        changed={view.data.changed}
        more={view.data.more_changed}
        values={boards === null || boards.length === 0}
      />
    </Page>
  );
}

function BoardDiff({ board }: { board: Diff }) {
  if (board.unread) {
    return <BodyText>{board.title} cannot be compared.</BodyText>;
  }
  return (
    <table aria-label={board.title}>
      <caption>{board.title}</caption>
      <tbody>
        {board.rows.map((row) => (
          <tr key={row.row.entrant}>
            <td>{row.row.name === '' ? MISSING : row.row.name}</td>
            <td>
              {moved(row.place_before, row.place_after)}
              {row.regrading.length > 0 ? ' regrading' : ''}
            </td>
            {row.cells.map((cell) => (
              <td key={cell.column}>
                {`${cell.column} ${shown(cell.before, cell.text_before)} → ${shown(cell.after, cell.text_after)}`}
                {cell.waiting.length > 0 ? ' waiting' : ''}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function moved(before: number | null, after: number | null): string {
  const from = before === null ? MISSING : String(before);
  const to = after === null ? MISSING : String(after);
  return from === to ? `stayed at ${to}` : `moved from ${from} to ${to}`;
}

function shown(number: string | null, text: string | null): string {
  return number ?? text ?? MISSING;
}

function Changes({
  changed,
  more,
  values,
}: {
  changed: Change[];
  more: number;
  values: boolean;
}) {
  const rows = changed.filter(
    (item) =>
      (values && item.values.length > 0) ||
      item.verdicts.length > 0 ||
      item.more_verdicts > 0,
  );
  if (rows.length === 0 && more === 0) return null;
  return (
    <ul aria-label="Changed submissions">
      {rows.map((item) => (
        <li key={item.number}>
          {`Submission ${String(item.number)}`}
          {values &&
            item.values.map(
              (value) =>
                ` ${value.name} ${shown(value.before, value.text_before)} → ${shown(value.after, value.text_after)}${value.waiting ? ' waiting' : ''}`,
            )}
          {item.verdicts.map((verdict) => ` ${verdictWords(verdict)}`)}
          {item.more_verdicts > 0 ? ` ${String(item.more_verdicts)} more runs` : ''}
        </li>
      ))}
      {more > 0 && <li>{`${String(more)} more submissions changed.`}</li>}
    </ul>
  );
}

function verdictWords(verdict: Change['verdicts'][number]): string {
  const who =
    verdict.run === null ? `${String(verdict.runs)} runs` : `Run ${verdict.run}`;
  return `${who} ${verdict.before ?? MISSING} → ${verdict.after ?? MISSING}`;
}
