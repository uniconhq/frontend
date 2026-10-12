import { useState, type ReactNode } from 'react';
import type { FeedEntry, Grading } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { PageLink } from '@/ui/PageLink';
import { OutLink } from '@/ui/OutLink';
import { verdictLabel } from '@/ui/verdicts';
import { formatDateTime } from '@/lib/time';
import { taskPath } from '@/lib/organiser-paths';
import {
  STATUS,
  bySubmission,
  logHref,
  nameOf,
  overLimitSentence,
  resultOf,
  submitterOf,
} from './feed';
import { changeOf, sideWords } from './regrades';
import { ScoredView } from './ScoredView';
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
      <PageLink to={taskPath(path.org, path.contest, task)}>{task}</PageLink>
    </span>
  );
}

/**
 * Which result a latest attempt with none leaves standing: while it is
 * graded, after it failed or once it was cancelled, the submission keeps the
 * result of its latest earlier attempt that finished with one, on the
 * leaderboards and for its entrant.
 */
function standsLine(grading: Grading): string | null {
  if (grading.last_good === null) return null;
  const earlier = `attempt ${String(grading.last_good)}'s result`;
  return grading.status === 'cancelled'
    ? `The entrant and the leaderboards keep ${earlier}.`
    : `The entrant and the leaderboards see ${earlier} until a newer attempt finishes with one.`;
}

/**
 * Where an attempt stands: its status, why one over the limit was not
 * graded, the reason a system error gave the organisers, the sentence a cancel told the entrant, the earlier result
 * that stands while it has none, what a finished run came to, and its log
 * where its run wrote one.
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
  const stands = standsLine(grading);
  return (
    <>
      <span>{STATUS[grading.status]}</span>
      {grading.status === 'over_limit' && (
        <BodyText tone="secondary">{overLimitSentence(grading.limit)}</BodyText>
      )}
      {grading.error !== null && <BodyText tone="secondary">{grading.error}</BodyText>}
      {grading.cancel_reason !== null && (
        <BodyText tone="secondary">
          Told the entrant: &ldquo;{grading.cancel_reason}&rdquo;
        </BodyText>
      )}
      {stands !== null && <BodyText tone="secondary">{stands}</BodyText>}
      {grading.status === 'done' && grading.result !== null && (
        <BodyText tone="secondary">{verdictLabel(resultOf(grading.result))}</BodyText>
      )}
      {grading.log && entry.task !== null && (
        <OutLink
          href={logHref({ ...path, task: entry.task }, grading.id)}
          label={`Log of ${name}`}
          newTab
        >
          Log
        </OutLink>
      )}
    </>
  );
}

/**
 * What a regrade did to the submission, on Gradings read by regrade: the
 * result it replaced and its own, side by side, the kind of change under
 * the new one.
 */
function ChangeCells({ entry }: { entry: FeedEntry }) {
  const change = entry.grading.change;
  return (
    <>
      <td>{change === null ? '—' : sideWords(change.earlier)}</td>
      <td>
        {change === null ? '—' : sideWords(change.now)}
        <BodyText tone="meta">{changeOf(entry)}</BodyText>
      </td>
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
  compared,
  earlier,
  scored,
  actions,
}: {
  path: ContestPath;
  entry: FeedEntry;
  head: boolean;
  showTask: boolean;
  compared: boolean;
  earlier?: { count: number; shown: boolean; toggle: () => void };
  scored?: { shown: boolean; toggle: () => void };
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
            {scored !== undefined && (
              <button
                type="button"
                className={classes.toggle}
                aria-expanded={scored.shown}
                aria-label={`Scored view of submission ${String(grading.submission_number)}`}
                onClick={scored.toggle}
              >
                {scored.shown ? 'Hide the scored view' : 'Scored view'}
              </button>
            )}
          </>
        ) : (
          <span className={classes.earlierName}>
            Submission {grading.submission_number}, replaced
          </span>
        )}
      </th>
      {compared && <ChangeCells entry={entry} />}
      <td>
        {grading.attempt}
        <BodyText tone="meta">publication {grading.publication}</BodyText>
        {grading.automatic && (
          <BodyText tone="meta">
            Retried by Unicon after attempt {grading.attempt - 1} failed
          </BodyText>
        )}
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
  compared,
  actions,
}: {
  path: ContestPath;
  attempts: FeedEntry[];
  showTask: boolean;
  compared: boolean;
  actions: RowActions | null;
}) {
  const [shown, setShown] = useState(false);
  const [scored, setScored] = useState(false);
  const [head, ...earlier] = attempts;
  if (head === undefined) return null;
  const task = head.task;
  const columns = (showTask ? 6 : 5) + (compared ? 2 : 0) + (actions !== null ? 1 : 0);
  return (
    <tbody aria-label={nameOf(head).replace(/, attempt \d+$/, '')}>
      <AttemptRow
        path={path}
        entry={head}
        head
        showTask={showTask}
        compared={compared}
        earlier={{ count: earlier.length, shown, toggle: () => setShown(!shown) }}
        scored={
          task !== null
            ? { shown: scored, toggle: () => setScored(!scored) }
            : undefined
        }
        actions={actions}
      />
      {scored && task !== null && (
        <tr>
          <td colSpan={columns}>
            <ScoredView path={path} task={task} entry={head} />
          </td>
        </tr>
      )}
      {shown &&
        earlier.map((entry) => (
          <AttemptRow
            key={entry.grading.id}
            path={path}
            entry={entry}
            head={false}
            showTask={showTask}
            compared={compared}
            actions={actions}
          />
        ))}
    </tbody>
  );
}

/**
 * Gradings, each submission once, headed by its highest attempt, with its
 * earlier attempts opening below it. The task column is left out where every
 * row is of one task. Read by a regrade, each row also gives the result the
 * regrade replaced and its own, side by side (#448). `actions`, when given,
 * draws what a latest attempt offers in a column of its own.
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
  const compared = entries.some((entry) => entry.grading.change !== null);
  return (
    <div className={classes.scroll}>
      <table className={classes.table} aria-label="Gradings">
        <thead>
          <tr>
            {showTask && <th scope="col">Task</th>}
            <th scope="col">Submitted by</th>
            <th scope="col">Submission</th>
            {compared && (
              <>
                <th scope="col">Before the regrade</th>
                <th scope="col">After it</th>
              </>
            )}
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
            compared={compared}
            actions={actions}
          />
        ))}
      </table>
    </div>
  );
}
