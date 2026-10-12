import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { $api, queryView } from '@/api/query';
import type { TaskStanding } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Modal } from '@/ui/Modal';
import { useMe } from '@/session';
import { holdsAtContest } from '../roles';
import { useContestSettings } from './settings';
import { STANDINGS, entrySentence, labelOf, useTaskTitles } from './task-entry';
import { TaskTimelineForm } from './TaskTimelineForm';
import shared from '../organise.module.css';
import classes from './contest.module.css';

/**
 * A task's place in its contest as a line that opens its dialog, ending in
 * "Change", for someone who may change it; plain text for anyone else.
 */
export function EntryLine({
  sentence,
  label,
  onOpen,
}: {
  sentence: string;
  /** The task, as "A · sum", for the button's name. */
  label: string;
  onOpen: (() => void) | null;
}) {
  if (onOpen === null) return <span>{sentence}</span>;
  return (
    <button
      type="button"
      className={classes.entryLine}
      aria-label={`Change ${label} in this contest`}
      onClick={onOpen}
    >
      <span>{sentence}</span>
      <span className={classes.change} aria-hidden>
        <span className={classes.dot}>·</span>Change
      </span>
    </button>
  );
}

/**
 * The dialog a task's place in its contest is changed in, from its row on
 * the contest's page or from the task's own page: what it is worth and when
 * it opens, falls due and closes. Opened while `standing` is given.
 */
export function TaskEntryDialog({
  org,
  contest,
  standing,
  label,
  onClose,
}: {
  org: string;
  contest: string;
  standing: TaskStanding | undefined;
  label: string;
  onClose: () => void;
}) {
  return (
    <Modal
      opened={standing !== undefined}
      onClose={onClose}
      title={`${label} in this contest`}
    >
      {standing !== undefined && (
        <div className={shared.stack}>
          <TaskTimelineForm
            org={org}
            contest={contest}
            standing={standing}
            label={label}
          />
          <BodyText tone="secondary">
            A task cannot be taken out of its contest yet, so the contest opens only
            once every one of its tasks is published.
          </BodyText>
        </div>
      )}
    </Modal>
  );
}

/**
 * Where a task stands in its contest, under the task's title on its own
 * page: "In Sample contest: 110 points, open for the whole contest ·
 * Change", the line opening the same dialog as the task's row on the
 * contest's page, for a manager of the contest. Shown to anyone who can
 * read the contest's list of tasks; someone whose role is at this task
 * alone is refused that list, and sees no line.
 */
export function TaskInContest({
  org,
  contest,
  task,
}: {
  org: string;
  contest: string;
  task: string;
}) {
  const path = { org, contest };
  const view = queryView(
    $api.useQuery('get', STANDINGS, { params: { path } }, { retry: false }),
  );
  const standing =
    view.state === 'ready'
      ? view.data.find((found) => found.task.name === task)
      : undefined;
  if (standing === undefined) return null;
  return <EntryOfTask org={org} contest={contest} standing={standing} />;
}

function EntryOfTask({
  org,
  contest,
  standing,
}: {
  org: string;
  contest: string;
  standing: TaskStanding;
}) {
  const manages = holdsAtContest(useMe().roles, org, contest, 'manager');
  const settings = useContestSettings(org, contest);
  const titles = useTaskTitles(org, contest, [standing.task.name]);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  if (settings.state !== 'ready') return null;
  const values = settings.data;
  const name = values === null || values.name.trim() === '' ? contest : values.name;
  const label = labelOf(standing, titles);
  const close = () => {
    setOpen(false);
    void queryClient.invalidateQueries({
      queryKey: $api.queryOptions('get', STANDINGS, {
        params: { path: { org, contest } },
      }).queryKey,
    });
  };
  return (
    <div className={classes.inContest}>
      <span>In {name}:</span>
      <EntryLine
        sentence={entrySentence(standing, values)}
        label={label}
        onOpen={manages ? () => setOpen(true) : null}
      />
      <TaskEntryDialog
        org={org}
        contest={contest}
        standing={open ? standing : undefined}
        label={label}
        onClose={close}
      />
    </div>
  );
}
