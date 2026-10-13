import { useState } from 'react';
import type { TaskStanding } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { RadioGroup } from '@/ui/RadioGroup';
import { formatWorth } from '@/lib/exact';
import {
  readContest,
  writeContest,
  type ContestValues,
  type TaskEntryValues,
} from '../forms/contest-values';
import type { FormProps } from '../forms/DefinitionFile';
import { NumberField, TimeField } from '../forms/fields';
import { numberProblem } from '../forms/yaml-doc';
import { ContestFile, FieldBox } from './ContestFile';
import { useOpenedField } from './opened';
import { markedBoardCovers } from './timeline';
import { fractionOf, percentOf } from './percent';
import shared from '../organise.module.css';
import forms from '../forms/forms.module.css';

/**
 * One task's place in the contest, changed from its row on the contest's
 * page or from its own page: what it is worth, when it opens, falls due and
 * closes, what a late day costs, and how many submissions may be marked
 * when a board counts marked ones. A setting the
 * save would refuse is not offered, with the reason beside it: a task that
 * gives no points has no worth and no due time.
 */
export function TaskTimelineForm({
  org,
  contest,
  standing,
  label,
}: {
  org: string;
  contest: string;
  standing: TaskStanding;
  /** What the task is called: its letter and its title. */
  label: string;
}) {
  return (
    <ContestFile org={org} contest={contest}>
      {(props) => <EntryForm {...props} standing={standing} label={label} />}
    </ContestFile>
  );
}

function EntryForm({
  doc,
  busy,
  onSave,
  admin,
  standing,
  label,
}: FormProps & { admin: boolean; standing: TaskStanding; label: string }) {
  const [read] = useState(() => readContest(doc));
  const index = read.values.tasks.findIndex((entry) => entry.id === standing.task.name);
  const [entry, setEntry] = useState<TaskEntryValues | undefined>(
    read.values.tasks[index],
  );
  const [late, setLate] = useState(() => percentOf(entry?.latePerDay ?? ''));
  const [opensAt, setOpensAt] = useState(entry !== undefined && entry.releaseAt !== '');
  const [closesAt, setClosesAt] = useState(entry !== undefined && entry.closes !== '');
  useOpenedField(true, { byItem: false });

  if (entry === undefined) {
    return (
      <BodyText>
        This task is not in the contest’s list of tasks, so it has no timeline here.
      </BodyText>
    );
  }
  const set = (change: Partial<TaskEntryValues>) =>
    setEntry((before) => (before === undefined ? before : { ...before, ...change }));
  const raw = (key: string) => read.rawTimes[`tasks.${String(entry.at)}.${key}`];
  const noPoints = standing.timeline.worth === null && standing.state.latest !== null;
  const total =
    entry.worth === '' && standing.timeline.worth !== null
      ? `${formatWorth(standing.timeline.worth)}, its test groups’ total`
      : 'Its test groups’ total';
  const marks = markedBoardCovers(read.values, entry.id);
  const after: ContestValues = {
    ...read.values,
    tasks: read.values.tasks.map((old, at) =>
      at === index ? { ...entry, latePerDay: fractionOf(late) } : old,
    ),
  };
  const changed = JSON.stringify(after) !== JSON.stringify(read.values);
  const lateProblem =
    late.trim() === ''
      ? undefined
      : (numberProblem(late) ??
        (Number(late) <= 0 || Number(late) > 100
          ? 'Give a percentage above 0 and at most 100.'
          : undefined));
  const problems = [
    numberProblem(entry.worth),
    numberProblem(entry.marks, true),
    lateProblem,
  ].filter((problem) => problem !== undefined);

  return (
    <form
      className={forms.form}
      aria-label={`${label} in this contest`}
      onSubmit={(event) => {
        event.preventDefault();
        onSave((fresh) => writeContest(fresh, read.values, after, { admin }));
      }}
    >
      <FieldBox name="worth">
        <NumberField
          label="Worth"
          value={entry.worth}
          onChange={(worth) => set({ worth })}
          placeholder={total}
          hint={
            noPoints
              ? 'This task gives no points, so it has no worth.'
              : 'The most points this task gives in the contest. Left empty, it is the total of its test groups’ points.'
          }
          disabled={noPoints}
        />
      </FieldBox>
      <FieldBox name="release_at">
        <RadioGroup
          label="Opens"
          value={opensAt ? 'at' : 'with'}
          options={[
            { value: 'with', label: 'When the contest starts' },
            { value: 'at', label: 'At a time' },
          ]}
          onChange={(choice) => {
            setOpensAt(choice === 'at');
            if (choice !== 'at') set({ releaseAt: '' });
          }}
        />
        {opensAt && (
          <TimeField
            label="Opens at"
            value={entry.releaseAt}
            raw={raw('release_at')}
            onChange={(releaseAt) => set({ releaseAt })}
          />
        )}
      </FieldBox>
      <FieldBox name="due">
        <RadioGroup
          label="Due"
          description={
            noPoints ? 'A task that gives no points is never late.' : undefined
          }
          value={entry.due === '' ? 'none' : 'at'}
          options={[
            { value: 'none', label: 'No due time' },
            { value: 'at', label: 'At a time' },
          ]}
          onChange={(choice) => {
            set({ due: choice === 'at' ? read.values.end : '' });
            if (choice !== 'at') setLate('');
          }}
          disabled={noPoints}
        />
        {entry.due !== '' && (
          <TimeField
            label="Due at"
            value={entry.due}
            raw={raw('due')}
            onChange={(due) => set({ due })}
            hint="After it, a submission is late."
          />
        )}
      </FieldBox>
      {entry.due !== '' && (
        <FieldBox name="late_per_day">
          <NumberField
            label="Taken off per started late day (%)"
            value={late}
            onChange={setLate}
            placeholder="100, so a late submission earns nothing"
            error={lateProblem}
          />
        </FieldBox>
      )}
      <FieldBox name="closes">
        <RadioGroup
          label="Closes"
          value={closesAt ? 'at' : 'with'}
          options={[
            { value: 'with', label: 'When the contest ends' },
            { value: 'at', label: 'At a time' },
          ]}
          onChange={(choice) => {
            setClosesAt(choice === 'at');
            if (choice !== 'at') set({ closes: '' });
          }}
        />
        {closesAt && (
          <TimeField
            label="Closes at"
            value={entry.closes}
            raw={raw('closes')}
            onChange={(closes) => set({ closes })}
            hint="The last moment it takes a submission."
          />
        )}
      </FieldBox>
      {marks && (
        <FieldBox name="marks">
          <NumberField
            label="Submissions each entrant may mark"
            value={entry.marks}
            onChange={(value) => set({ marks: value })}
            placeholder="1"
            hint="For the leaderboards that count only the submissions each entrant marks."
            whole
          />
        </FieldBox>
      )}
      <div className={shared.actions}>
        <Button type="submit" loading={busy} disabled={!changed || problems.length > 0}>
          Save
        </Button>
      </div>
    </form>
  );
}
