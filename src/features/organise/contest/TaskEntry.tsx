import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { $api, queryView } from '@/api/query';
import type { TakeOut, TaskStanding } from '@/api/types';
import { Modal } from '@/ui/Modal';
import { useMe } from '@/session';
import { contestPath } from '@/lib/organiser-paths';
import { holdsAtContest } from '../roles';
import { useContestSettings } from './settings';
import { STANDINGS, entrySentence, labelOf, useTaskTitles } from './task-entry';
import { TaskTimelineForm } from './TaskTimelineForm';
import { TakeOutFoot, TakingOutBody } from './TakeOut';
import { takingOutTitle, type TakingOut } from './take-out';
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
 * it opens, falls due and closes; and, apart at its foot, the way to take
 * the task out of the contest, or to put a withdrawn one back (#450), each
 * asked in the dialog itself first. Opened while `standing` is given, on its
 * question to put the task back when `start` says so, as the row's Put back
 * opens it. `onTakenOut` hears what taking the task out did, once the
 * dialog has closed.
 */
export function TaskEntryDialog({
  org,
  contest,
  standing,
  label,
  start = null,
  onClose,
  onTakenOut,
}: {
  org: string;
  contest: string;
  standing: TaskStanding | undefined;
  label: string;
  start?: 'put-back' | null;
  onClose: () => void;
  onTakenOut?: (done: TakeOut) => void;
}) {
  const [asking, setAsking] = useState<TakingOut | null>(null);
  // Each opening starts at the timeline, or at the question the row asked.
  const opened = standing === undefined ? null : `${standing.task.name} ${start ?? ''}`;
  const [shownOpened, setShownOpened] = useState(opened);
  if (shownOpened !== opened) {
    setShownOpened(opened);
    setAsking(start === 'put-back' ? { step: 'put-back' } : null);
  }
  const close = () => {
    setAsking(null);
    onClose();
  };
  return (
    <Modal
      opened={standing !== undefined}
      onClose={close}
      title={
        asking === null ? `${label} in this contest` : takingOutTitle(asking, label)
      }
    >
      {standing !== undefined &&
        (asking !== null ? (
          <TakingOutBody
            org={org}
            contest={contest}
            task={standing.task.name}
            label={label}
            asking={asking}
            onAsk={setAsking}
            onDone={(done) => {
              close();
              if (done !== 'put-back') onTakenOut?.(done);
            }}
            onCancel={() => (start === null ? setAsking(null) : close())}
          />
        ) : (
          <div className={shared.stack}>
            <TaskTimelineForm
              org={org}
              contest={contest}
              standing={standing}
              label={label}
            />
            <div className={classes.foot}>
              <TakeOutFoot standing={standing} label={label} onAsk={setAsking} />
            </div>
          </div>
        ))}
    </Modal>
  );
}

/**
 * Where a task stands in its contest, under the task's title on its own
 * page: "In Sample contest: 110 points, open for the whole contest ·
 * Change", the line opening the same dialog as the task's row on the
 * contest's page, for a manager of the contest, ", withdrawn" after the
 * contest's name for a withdrawn task; removing the task from there goes
 * back to the contest's page. Shown to anyone who can
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
  const navigate = useNavigate();
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
      <span>
        In {name}
        {standing.withdrawn && ', withdrawn'}:
      </span>
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
        onTakenOut={(done) => {
          // A removed task is gone, so its page goes with it.
          if (done === 'remove') void navigate(contestPath(org, contest));
        }}
      />
    </div>
  );
}
