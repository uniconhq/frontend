import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { $api, queryView } from '@/api/query';
import { isApiError } from '@/api/problem';
import type { components } from '@/api/schema';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Checkbox } from '@/ui/Checkbox';
import { SectionTitle } from '@/ui/SectionTitle';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { MISSING } from '@/ui/number/words';
import { ScoredResult } from '@/ui/scored/ScoredResult';
import { useMe } from '@/session';
import { useTaskParams } from '@/lib/route-params';
import { TASK_SECTIONS, sectionOf } from '@/lib/sections';
import { formatDateTime } from '@/lib/time';
import { STATUS } from '../gradings/feed';
import { holdsAt } from '../roles';
import { StaffFiles } from '../staff-read';
import { staffText } from '../staff-text';
import { SectionPage } from '../SectionPage';
import classes from '../organise.module.css';

type Row = components['schemas']['QueueRow'];
type Queued = components['schemas']['QueuedSubmission'];

const QUEUE = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/organise/queue';
const ENTER =
  '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/organise/submissions/{number}/entries';

/**
 * The task's grading queue: one block per entrant the task has closed
 * for, each counted submission and a box for each mark a manager enters.
 */
export function TaskQueuePage() {
  const { org, contest, task } = useTaskParams();
  const manager = holdsAt(
    useMe().roles,
    { kind: 'task', org, contest, task },
    'manager',
  );
  return (
    <SectionPage section={sectionOf(TASK_SECTIONS, 'queue')}>
      <Queue org={org} contest={contest} task={task} manager={manager} />
    </SectionPage>
  );
}

function Queue({
  org,
  contest,
  task,
  manager,
}: {
  org: string;
  contest: string;
  task: string;
  manager: boolean;
}) {
  const view = queryView(
    $api.useQuery('get', QUEUE, { params: { path: { org, contest, task } } }),
  );
  const [unmarked, setUnmarked] = useState(false);
  const [board, setBoard] = useState('');
  if (view.state === 'loading') return <PageSkeleton />;
  if (view.state === 'error')
    return <ErrorBlock error={view.error} onRetry={view.retry} />;
  const boards = leaderboardsOf(view.data);
  const rows = view.data
    .map((row) => ({
      ...row,
      submissions: row.submissions.filter((item) => shows(item, unmarked, board)),
    }))
    .filter((row) => row.submissions.length > 0);
  return (
    <div className={classes.stack}>
      <Checkbox label="Unmarked only" checked={unmarked} onChange={setUnmarked} />
      {boards.length > 0 && (
        <Select
          label="Leaderboard"
          value={board}
          placeholder="Every leaderboard"
          options={boards.map((key) => ({ value: key, label: key }))}
          onChange={setBoard}
        />
      )}
      {rows.length === 0 ? (
        <BodyText tone="secondary">Nothing is waiting for a mark.</BodyText>
      ) : (
        rows.map((row) => (
          <Card key={row.row.entrant}>
            <div className={classes.stack}>
              <SectionTitle>
                {row.row.name === '' ? MISSING : row.row.name}
              </SectionTitle>
              <BodyText tone="secondary">
                Closed {formatDateTime(new Date(row.closed_at))}
              </BodyText>
              {row.submissions.map((item) => (
                <Submission
                  key={item.number}
                  org={org}
                  contest={contest}
                  task={task}
                  entrant={row.row.entrant}
                  submission={item}
                  manager={manager}
                />
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function Submission({
  org,
  contest,
  task,
  entrant,
  submission,
  manager,
}: {
  org: string;
  contest: string;
  task: string;
  entrant: string;
  submission: Queued;
  manager: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={classes.stack}>
      <BodyText>
        {`Submission ${String(submission.number)}`}
        {submission.counted_by.length > 0 &&
          ` · ${submission.counted_by.map((item) => `${item.leaderboard} ${item.column}`).join(', ')}`}
      </BodyText>
      {submission.marks.map((mark) => (
        <MarkBox
          key={mark.value}
          org={org}
          contest={contest}
          task={task}
          entrant={entrant}
          number={submission.number}
          value={mark.value}
          mark={mark.mark}
          manager={manager}
        />
      ))}
      <Button size="xs" variant="secondary" onClick={() => setOpen((value) => !value)}>
        {open ? 'Hide the submission' : 'Open the submission'}
      </Button>
      {open && (
        <StaffSubmission
          org={org}
          contest={contest}
          task={task}
          entrant={entrant}
          number={submission.number}
        />
      )}
    </div>
  );
}

/** A mark as the forge takes one: a plain decimal, such as `7.5`. Its bounds the forge checks. */
const DECIMAL = /^-?\d+(\.\d+)?$/;

function MarkBox({
  org,
  contest,
  task,
  entrant,
  number,
  value,
  mark,
  manager,
}: {
  org: string;
  contest: string;
  task: string;
  entrant: string;
  number: number;
  value: string;
  mark: string | null;
  manager: boolean;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(mark ?? '');
  // The mark as last kept, so a blur that changed nothing posts nothing.
  const [kept, setKept] = useState(mark ?? '');
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const enter = $api.useMutation('post', ENTER);
  if (!manager) {
    return (
      <BodyText>
        {value}: {mark ?? MISSING}
      </BodyText>
    );
  }
  return (
    <TextInput
      label={value}
      value={draft}
      inputMode="decimal"
      error={error ?? undefined}
      description={saved === null ? undefined : `Saved by you ${saved}`}
      onChange={(next) => {
        setDraft(next);
        setError(null);
      }}
      onCommit={() => {
        const written = draft.trim();
        if (written === kept) return;
        if (written !== '' && !DECIMAL.test(written)) {
          setError('Write the mark as a plain decimal, such as 7.5.');
          return;
        }
        enter.mutate(
          {
            params: { path: { org, contest, task, number }, query: { entrant } },
            body: { value, mark: written },
          },
          {
            onSuccess: (entered) => {
              setSaved(formatDateTime(new Date(entered.at)));
              setDraft(entered.mark ?? '');
              setKept(entered.mark ?? '');
              void queryClient.invalidateQueries({
                queryKey: $api.queryOptions('get', QUEUE, {
                  params: { path: { org, contest, task } },
                }).queryKey,
              });
            },
            onError: (caught) => {
              setSaved(null);
              setError(
                isApiError(caught)
                  ? (caught.detail ?? 'The mark was refused.')
                  : 'The mark was refused.',
              );
            },
          },
        );
      }}
    />
  );
}

function shows(item: Queued, unmarked: boolean, board: string): boolean {
  if (unmarked && item.marks.every((mark) => mark.mark !== null)) return false;
  if (board !== '' && !item.counted_by.some((cell) => cell.leaderboard === board))
    return false;
  return true;
}

function leaderboardsOf(rows: Row[]): string[] {
  const found = new Set<string>();
  for (const row of rows) {
    for (const item of row.submissions) {
      for (const cell of item.counted_by) found.add(cell.leaderboard);
    }
  }
  return [...found];
}

function StaffSubmission({
  org,
  contest,
  task,
  entrant,
  number,
}: {
  org: string;
  contest: string;
  task: string;
  entrant: string;
  number: number;
}) {
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/organise/submissions/{number}',
      { params: { path: { org, contest, task, number }, query: { entrant } } },
    ),
  );
  const files = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/organise/submissions/{number}/files',
      { params: { path: { org, contest, task, number }, query: { entrant } } },
    ),
  );
  if (view.state === 'loading') return <PageSkeleton rows={2} />;
  if (view.state === 'error')
    return <ErrorBlock error={view.error} onRetry={view.retry} />;
  const where = { org, contest, task, number };
  const grading = view.data.grading;
  return (
    <div className={classes.stack}>
      {files.state === 'error' && (
        <ErrorBlock error={files.error} onRetry={files.retry} />
      )}
      {files.state === 'ready' && (
        <StaffFiles where={where} entrant={entrant} files={files.data} />
      )}
      {grading === null ? (
        <BodyText tone="secondary">Not graded</BodyText>
      ) : (
        <>
          <BodyText tone="secondary">{STATUS[grading.status]}</BodyText>
          <ScoredResult
            grading={grading}
            readText={(ask) => staffText(where, entrant, ask)}
          />
        </>
      )}
    </div>
  );
}
