import { useState, type ReactNode } from 'react';
import type { Fallback, FeedEntry } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { PageLink } from '@/ui/PageLink';
import { TextLink } from '@/ui/TextLink';
import { formatDateTime } from '@/lib/time';
import { taskPath } from '@/lib/organiser-paths';
import { STATUS, bySubmission, logHref, nameOf, resultOf, submitterOf } from './feed';
import classes from './feed.module.css';

type ContestPath = { org: string; contest: string };

/** What a latest attempt offers, drawn in a column of its own. */
export type RowActions = (entry: FeedEntry, name: string) => ReactNode;

function when(at: string | null): string | null {
  return at === null ? null : formatDateTime(new Date(at));
}

/** The task by its letter and name, the name a link to the task's page. */
function TaskCell({ path, entry }: { path: ContestPath; entry: FeedEntry }) {
  const { task, label } = entry;
  if (task === null) {
    return <BodyText tone="secondary">A task the contest no longer lists</BodyText>;
  }
  return (
    <span className={classes.task}>
      {label !== null && <span className={classes.letter}>{label}</span>}
      <PageLink to={taskPath(path.org, path.contest, task)} mono>
        {task}
      </PageLink>
    </span>
  );
}

/** Who has a broken attempt count as its submission's last good result. */
const FALLBACK_BY: Record<Fallback, string> = {
  staff: 'as staff asked',
  contest: "as the contest's settings say",
};

/**
 * Where an attempt stands: its status, the reason a system error gave staff,
 * the sentence a cancel told the contestant, the earlier result a fallback
 * counts in its place, what a finished run came to, and its log where its
 * run wrote one.
 */
function StatusCell({
  path,
  entry,
  name,
}: {
  path: ContestPath;
  entry: FeedEntry;
  name: string;
}) {
  const { grading } = entry;
  return (
    <>
      <span>{STATUS[grading.status]}</span>
      {grading.error !== null && <BodyText tone="secondary">{grading.error}</BodyText>}
      {grading.cancel_reason !== null && (
        <BodyText tone="secondary">
          Told the contestant: &ldquo;{grading.cancel_reason}&rdquo;
        </BodyText>
      )}
      {grading.fallback !== null && grading.last_good !== null && (
        <BodyText tone="secondary">
          Counts as attempt {grading.last_good}&apos;s result,{' '}
          {FALLBACK_BY[grading.fallback]}.
        </BodyText>
      )}
      {grading.status === 'done' && grading.result !== null && (
        <BodyText tone="secondary">{resultOf(grading.result)}</BodyText>
      )}
      {grading.log && entry.task !== null && (
        <TextLink
          href={logHref({ ...path, task: entry.task }, grading.id)}
          label={`Log of ${name}`}
          newTab
        >
          Log
        </TextLink>
      )}
    </>
  );
}

function TimesCell({ entry }: { entry: FeedEntry }) {
  const { grading } = entry;
  const times = [
    ['Queued', when(grading.queued_at)],
    ['Started', when(grading.started_at)],
    ['Finished', when(grading.finished_at)],
  ].filter((pair): pair is [string, string] => pair[1] !== null);
  return (
    <dl className={classes.times}>
      {times.map(([label, at]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{at}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * One attempt as a row. The highest attempt of a submission on the page heads
 * it and carries the toggle for the others. Only the submission's latest
 * attempt, as the server says, carries what `actions` gives it; an earlier
 * one, also the head when a filter left the latest out, is marked so and is
 * there to be read.
 */
function AttemptRow({
  path,
  entry,
  head,
  showTask,
  earlier,
  actions,
}: {
  path: ContestPath;
  entry: FeedEntry;
  head: boolean;
  showTask: boolean;
  earlier?: { count: number; shown: boolean; toggle: () => void };
  actions: RowActions | null;
}) {
  const { grading } = entry;
  const name = nameOf(entry);
  return (
    <tr className={grading.latest ? undefined : classes.earlier}>
      {showTask && (
        <td>
          <TaskCell path={path} entry={entry} />
        </td>
      )}
      <td>{submitterOf(entry.by)}</td>
      <th scope="row">
        {head ? (
          <>
            Submission {grading.submission_number}
            <BodyText tone="meta">
              {formatDateTime(new Date(grading.submitted_at))}
            </BodyText>
            {!grading.latest && (
              <BodyText tone="meta">
                An earlier attempt; the latest is not among these.
              </BodyText>
            )}
            {earlier !== undefined && earlier.count > 0 && (
              <button
                type="button"
                className={classes.toggle}
                aria-expanded={earlier.shown}
                onClick={earlier.toggle}
              >
                {earlier.shown ? 'Hide' : 'Show'} earlier attempts ({earlier.count})
              </button>
            )}
          </>
        ) : (
          <span className={classes.earlierName}>
            Submission {grading.submission_number}, earlier
          </span>
        )}
      </th>
      <td>
        {grading.attempt}
        <BodyText tone="meta">publication {grading.publication}</BodyText>
      </td>
      <td>
        <StatusCell path={path} entry={entry} name={name} />
      </td>
      <td>
        <TimesCell entry={entry} />
      </td>
      {actions !== null && <td>{grading.latest && actions(entry, name)}</td>}
    </tr>
  );
}

function Submission({
  path,
  attempts,
  showTask,
  actions,
}: {
  path: ContestPath;
  attempts: FeedEntry[];
  showTask: boolean;
  actions: RowActions | null;
}) {
  const [shown, setShown] = useState(false);
  const [head, ...earlier] = attempts;
  if (head === undefined) return null;
  return (
    <tbody aria-label={nameOf(head).replace(/, attempt \d+$/, '')}>
      <AttemptRow
        path={path}
        entry={head}
        head
        showTask={showTask}
        earlier={{ count: earlier.length, shown, toggle: () => setShown(!shown) }}
        actions={actions}
      />
      {shown &&
        earlier.map((entry) => (
          <AttemptRow
            key={entry.grading.id}
            path={path}
            entry={entry}
            head={false}
            showTask={showTask}
            actions={actions}
          />
        ))}
    </tbody>
  );
}

/**
 * Gradings, each submission once, headed by its highest attempt, with its
 * earlier attempts opening below it. The task column is left out where every
 * row is of one task. `actions`, when given, draws what a latest attempt
 * offers in a column of its own.
 */
export function FeedTable({
  path,
  entries,
  showTask,
  actions,
}: {
  path: ContestPath;
  entries: FeedEntry[];
  showTask: boolean;
  actions: RowActions | null;
}) {
  return (
    <div className={classes.scroll}>
      <table className={classes.table} aria-label="Gradings">
        <thead>
          <tr>
            {showTask && <th scope="col">Task</th>}
            <th scope="col">Submitted by</th>
            <th scope="col">Submission</th>
            <th scope="col">Attempt</th>
            <th scope="col">Status</th>
            <th scope="col">Times</th>
            {actions !== null && <th scope="col">Actions</th>}
          </tr>
        </thead>
        {bySubmission(entries).map(({ key, attempts }) => (
          <Submission
            key={key}
            path={path}
            attempts={attempts}
            showTask={showTask}
            actions={actions}
          />
        ))}
      </table>
    </div>
  );
}
