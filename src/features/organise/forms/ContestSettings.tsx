import { useState } from 'react';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { Select } from '@/ui/Select';
import { Textarea } from '@/ui/Textarea';
import { TextInput } from '@/ui/TextInput';
import type { Place } from '../files/place';
import shared from '../organise.module.css';
import {
  letterOf,
  readContest,
  writeContest,
  type ContestValues,
  type TaskEntryValues,
} from './contest-values';
import { DefinitionFile, type FormProps } from './DefinitionFile';
import { Fieldset, NumberField, TimeField } from './fields';
import { numberProblem } from './yaml-doc';
import classes from './forms.module.css';

const STATES = ['draft', 'published', 'archived'];
const VISIBILITIES = [
  { value: 'everyone', label: 'everyone: anyone, guests included' },
  { value: 'signed-in', label: 'signed-in: anyone signed in' },
  { value: 'hidden', label: 'hidden: its contestants and organisers' },
];
const ADMIN_ONLY = 'Only an admin of the contest changes these.';

/** The choices of a select, with the file's own value kept when it is none of them. */
function choices(
  value: string,
  options: { value: string; label: string }[],
): { value: string; label: string }[] {
  return value === '' || options.some((option) => option.value === value)
    ? options
    : [{ value, label: value }, ...options];
}

/**
 * `contest.yaml` as fields, with the file as text in the next tab for the
 * leaderboards and anything else the form does not show. A manager sees the
 * admin's keys and cannot change them.
 */
export function ContestSettings({ place, admin }: { place: Place; admin: boolean }) {
  return (
    <DefinitionFile
      place={place}
      path="contest.yaml"
      admin={admin}
      label="The contest's settings"
    >
      {(props) => <ContestForm {...props} admin={admin} />}
    </DefinitionFile>
  );
}

function ContestForm({ doc, busy, onSave, admin }: FormProps & { admin: boolean }) {
  const [read] = useState(() => readContest(doc));
  const [values, setValues] = useState<ContestValues>(read.values);
  const set = <K extends keyof ContestValues>(key: K, value: ContestValues[K]) =>
    setValues((before) => ({ ...before, [key]: value }));
  const setEntry = (index: number, change: Partial<TaskEntryValues>) =>
    setValues((before) => ({
      ...before,
      tasks: before.tasks.map((entry, at) =>
        at === index ? { ...entry, ...change } : entry,
      ),
    }));
  const move = (index: number, by: -1 | 1) =>
    setValues((before) => {
      const tasks = [...before.tasks];
      const [entry] = tasks.splice(index, 1);
      if (entry !== undefined) tasks.splice(index + by, 0, entry);
      return { ...before, tasks };
    });

  const raw = (path: string) => read.rawTimes[path];
  const regLocked = !admin || read.unreadable.includes('registration');
  const changed = JSON.stringify(values) !== JSON.stringify(read.values);
  const problems = [
    numberProblem(values.capacity, true),
    numberProblem(values.teamSize, true),
    ...values.tasks.flatMap((entry) => [
      numberProblem(entry.worth),
      numberProblem(entry.latePerDay),
      numberProblem(entry.marks, true),
    ]),
  ].filter((problem) => problem !== undefined);

  return (
    <form
      className={classes.form}
      aria-label="Contest settings"
      onSubmit={(event) => {
        event.preventDefault();
        onSave((fresh) => writeContest(fresh, read.values, values, { admin }));
      }}
    >
      <Fieldset legend="The contest" note={admin ? undefined : ADMIN_ONLY}>
        <TextInput
          label="Name"
          value={values.name}
          onChange={(value) => set('name', value)}
          disabled={!admin}
        />
        <Textarea
          label="Description"
          value={values.description}
          onChange={(value) => set('description', value)}
          readOnly={!admin}
          rows={3}
        />
        <div className={classes.grid}>
          <Select
            label="State"
            value={values.state}
            options={choices(
              values.state,
              STATES.map((state) => ({ value: state, label: state })),
            )}
            placeholder={values.state === '' ? 'Not set' : undefined}
            onChange={(value) => set('state', value)}
            disabled={!admin}
          />
          <Select
            label="Who sees it"
            value={values.visibility}
            options={choices(values.visibility, VISIBILITIES)}
            placeholder={values.visibility === '' ? 'Not set' : undefined}
            onChange={(value) => set('visibility', value)}
            disabled={!admin}
          />
        </div>
      </Fieldset>

      <Fieldset legend="When it runs">
        <div className={classes.grid}>
          <TimeField
            label="Start"
            value={values.start}
            raw={raw('start')}
            onChange={(value) => set('start', value)}
          />
          <TimeField
            label="End"
            value={values.end}
            raw={raw('end')}
            onChange={(value) => set('end', value)}
          />
        </div>
      </Fieldset>

      <Fieldset
        legend="Who may enter"
        note={
          read.unreadable.includes('registration')
            ? 'registration is not a mapping the form can read; edit it as text.'
            : admin
              ? 'Left empty, a field is not set: no window, no pattern, no code, no cap.'
              : ADMIN_ONLY
        }
      >
        <Checkbox
          label="By invitation only"
          checked={values.inviteOnly}
          onChange={(checked) => set('inviteOnly', checked)}
          disabled={regLocked}
        />
        <div className={classes.grid}>
          <TimeField
            label="Registration opens"
            value={values.opens}
            raw={raw('registration.opens')}
            onChange={(value) => set('opens', value)}
            disabled={regLocked}
          />
          <TimeField
            label="Registration closes"
            value={values.closes}
            raw={raw('registration.closes')}
            onChange={(value) => set('closes', value)}
            disabled={regLocked}
          />
          <Select
            label="Approval"
            value={values.approval}
            options={choices(values.approval, [
              { value: 'auto', label: 'auto: approved when the rules pass' },
              { value: 'manual', label: 'manual: an organiser decides' },
            ])}
            placeholder="Not set (manual)"
            onChange={(value) => set('approval', value)}
            disabled={regLocked}
          />
          <NumberField
            label="Capacity"
            value={values.capacity}
            onChange={(value) => set('capacity', value)}
            hint="The most contestants, approved and pending."
            whole
            disabled={regLocked}
          />
          <TextInput
            label="Email pattern"
            value={values.emailPattern}
            onChange={(value) => set('emailPattern', value)}
            description="A regular expression the email must match."
            disabled={regLocked}
          />
          <TextInput
            label="Code"
            value={values.code}
            onChange={(value) => set('code', value)}
            description="What a contestant types to register."
            disabled={regLocked}
          />
        </div>
      </Fieldset>

      <Fieldset legend="Teams">
        <NumberField
          label="Team size"
          value={values.teamSize}
          onChange={(value) => set('teamSize', value)}
          hint="The most members a team may have. Empty: no teams."
          whole
        />
      </Fieldset>

      <Fieldset
        legend="Tasks"
        note={
          read.unreadable.includes('tasks')
            ? 'tasks is not a list of entries with an id the form can read; edit it as text.'
            : 'Each task is shown under the letter of its place in the list. Empty times are the defaults: released at the start, closing at the end.'
        }
      >
        {values.tasks.length === 0 ? (
          <BodyText tone="secondary">No tasks yet.</BodyText>
        ) : (
          <ol className={classes.entries} aria-label="Task entries">
            {values.tasks.map((entry, index) => (
              <TaskEntry
                key={entry.id}
                entry={entry}
                index={index}
                last={index === values.tasks.length - 1}
                raw={(key) => raw(`tasks.${entry.at}.${key}`)}
                onChange={(change) => setEntry(index, change)}
                onMove={(by) => move(index, by)}
              />
            ))}
          </ol>
        )}
      </Fieldset>

      <BodyText tone="secondary">
        The leaderboards are edited in the contest.yaml tab; this form leaves them as
        they are.
      </BodyText>
      <div className={shared.actions}>
        <Button type="submit" loading={busy} disabled={!changed || problems.length > 0}>
          Save settings
        </Button>
        {changed && <BodyText tone="secondary">Unsaved changes</BodyText>}
      </div>
    </form>
  );
}

function TaskEntry({
  entry,
  index,
  last,
  raw,
  onChange,
  onMove,
}: {
  entry: TaskEntryValues;
  index: number;
  last: boolean;
  raw: (key: string) => string | undefined;
  onChange: (change: Partial<TaskEntryValues>) => void;
  onMove: (by: -1 | 1) => void;
}) {
  const letter = letterOf(index);
  return (
    <li>
      <Fieldset legend={`${letter}: ${entry.id}`}>
        <div className={classes.grid}>
          <NumberField
            label={`${letter} worth`}
            value={entry.worth}
            onChange={(worth) => onChange({ worth })}
            hint="The most points. Empty: 100."
          />
          <TimeField
            label={`${letter} released at`}
            value={entry.releaseAt}
            raw={raw('release_at')}
            onChange={(releaseAt) => onChange({ releaseAt })}
          />
          <TimeField
            label={`${letter} due`}
            value={entry.due}
            raw={raw('due')}
            onChange={(due) => onChange({ due })}
          />
          <NumberField
            label={`${letter} taken off per late day`}
            value={entry.latePerDay}
            onChange={(latePerDay) => onChange({ latePerDay })}
            hint="Above 0, at most 1. Empty: 1."
          />
          <TimeField
            label={`${letter} closes`}
            value={entry.closes}
            raw={raw('closes')}
            onChange={(closes) => onChange({ closes })}
          />
          <NumberField
            label={`${letter} marks`}
            value={entry.marks}
            onChange={(marks) => onChange({ marks })}
            hint="Only with a marked board."
            whole
          />
        </div>
        <div className={shared.actions}>
          <Button
            size="xs"
            variant="secondary"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            label={`Move ${entry.id} up`}
          >
            Up
          </Button>
          <Button
            size="xs"
            variant="secondary"
            disabled={last}
            onClick={() => onMove(1)}
            label={`Move ${entry.id} down`}
          >
            Down
          </Button>
        </div>
      </Fieldset>
    </li>
  );
}
