import { useState, type ReactNode } from 'react';
import type { FeedEntry } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { PageLink } from '@/ui/PageLink';
import { TextLink } from '@/ui/TextLink';
import { formatDateTime } from '@/lib/time';
import { taskPath } from '@/lib/organiser-paths';
import { STATUS, bySubmission, logHref, resultOf, submitterOf } from './feed';
import classes from './feed.module.css';

type ContestPath = { org: string; contest: string };

/** A grading's name for a screen reader, where several rows read alike. */
function nameOf(entry: FeedEntry, letters: Map<string, string>): string {
  const task = entry.task === null ? 'a task' : (letters.get(entry.task) ?? entry.task);
  const { grading } = entry;
  return `${task} submission ${String(grading.submission_number)} by ${submitterOf(entry.by)}, attempt ${String(grading.attempt)}`;
}

function when(at: string | null): string | null {
  return at === null ? null : formatDateTime(new Date(at));
}

/** The task by its letter and name, the name a link to the task's page. */
function TaskCell({
  path,
  task,
  letters,
}: {
  path: ContestPath;
  task: string | null;
  letters: Map<string, string>;
}) {
  if (task === null) {
    return <BodyText tone="secondary">A task the contest no longer lists</BodyText>;
  }
  const letter = letters.get(task);
  return (
    <span className={classes.task}>
      {letter !== undefined && <span className={classes.letter}>{letter}</span>}
      <PageLink to={taskPath(path.org, path.contest, task)} mono>
        {task}
      </PageLink>
    </span>
  );
}

/**
 * Where an attempt stands: its status, the reason a system error gave staff,
 * the sentence a cancel told the contestant, what a finished run came to, and
 * its log where its run wrote one.
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
 * One attempt as a row. The latest attempt of a submission is headed by the
 * submission and carries the toggle for the earlier ones, and whatever
 * `actions` gives it; an earlier attempt is there to be read.
 */
function AttemptRow({
  path,
  entry,
  letters,
  latest,
  earlier,
  actions,
}: {
  path: ContestPath;
  entry: FeedEntry;
  letters: Map<string, string>;
  latest: boolean;
  earlier?: { count: number; shown: boolean; toggle: () => void };
  actions: ((entry: FeedEntry, name: string) => ReactNode) | null;
}) {
  const { grading } = entry;
  const name = nameOf(entry, letters);
  return (
    <tr className={latest ? undefined : classes.earlier}>
      <td>
        <TaskCell path={path} task={entry.task} letters={letters} />
      </td>
      <td>{submitterOf(entry.by)}</td>
      <th scope="row">
        {latest ? (
          <>
            Submission {grading.submission_number}
            <BodyText tone="meta">
              {formatDateTime(new Date(grading.submitted_at))}
            </BodyText>
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
      {actions !== null && <td>{latest && actions(entry, name)}</td>}
    </tr>
  );
}

function Submission({
  path,
  attempts,
  letters,
  actions,
}: {
  path: ContestPath;
  attempts: FeedEntry[];
  letters: Map<string, string>;
  actions: ((entry: FeedEntry, name: string) => ReactNode) | null;
}) {
  const [shown, setShown] = useState(false);
  const [latest, ...earlier] = attempts;
  if (latest === undefined) return null;
  return (
    <tbody aria-label={nameOf(latest, letters).replace(/, attempt \d+$/, '')}>
      <AttemptRow
        path={path}
        entry={latest}
        letters={letters}
        latest
        earlier={{ count: earlier.length, shown, toggle: () => setShown(!shown) }}
        actions={actions}
      />
      {shown &&
        earlier.map((entry) => (
          <AttemptRow
            key={entry.grading.id}
            path={path}
            entry={entry}
            letters={letters}
            latest={false}
            actions={actions}
          />
        ))}
    </tbody>
  );
}

/**
 * The feed's gradings, each submission once, headed by its latest attempt,
 * with its earlier attempts opening below it. `actions`, when given, draws
 * what a latest attempt offers in a column of its own.
 */
export function FeedTable({
  path,
  entries,
  letters,
  actions,
}: {
  path: ContestPath;
  entries: FeedEntry[];
  letters: Map<string, string>;
  actions: ((entry: FeedEntry, name: string) => ReactNode) | null;
}) {
  return (
    <div className={classes.scroll}>
      <table className={classes.table} aria-label="Gradings">
        <thead>
          <tr>
            <th scope="col">Task</th>
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
            letters={letters}
            actions={actions}
          />
        ))}
      </table>
    </div>
  );
}
