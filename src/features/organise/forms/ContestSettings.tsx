import { useState } from 'react';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { RadioGroup } from '@/ui/RadioGroup';
import { Textarea } from '@/ui/Textarea';
import { TextInput } from '@/ui/TextInput';
import { ContestFile, FieldBox } from '../contest/ContestFile';
import { useOpenedField } from '../contest/opened';
import shared from '../organise.module.css';
import { readContest, writeContest, type ContestValues } from './contest-values';
import type { FormProps } from './DefinitionFile';
import { Fieldset, NumberField, TimeField } from './fields';
import { numberProblem } from './yaml-doc';
import classes from './forms.module.css';

const ADMIN_ONLY = 'Only an admin of the contest changes these.';

/** Whether the contest is entered in teams, from its most people in one entrant. */
function teamsOn(values: ContestValues): boolean {
  return values.most !== '' && values.most !== '1';
}

/**
 * The contest's settings that are neither how people enter, its state, its
 * tasks nor its boards, in sections: its name and description, when it
 * runs, whether people enter in teams, and what a submission whose grading
 * failed counts as. Each section has a heading and a line saying what it is
 * for. A manager sees the admin's settings and cannot change them.
 */
export function ContestSettings({ org, contest }: { org: string; contest: string }) {
  return (
    <ContestFile org={org} contest={contest}>
      {(props) => <SettingsForm {...props} />}
    </ContestFile>
  );
}

function SettingsForm({ doc, busy, onSave, admin }: FormProps & { admin: boolean }) {
  const [read] = useState(() => readContest(doc));
  const [values, setValues] = useState<ContestValues>(read.values);
  useOpenedField(true);
  const set = <K extends keyof ContestValues>(key: K, value: ContestValues[K]) =>
    setValues((before) => ({ ...before, [key]: value }));
  const raw = (path: string) => read.rawTimes[path];
  const teams = teamsOn(values);
  const changed = JSON.stringify(values) !== JSON.stringify(read.values);
  const fewestTooMany =
    teams &&
    values.fewest !== '' &&
    numberProblem(values.fewest, true) === undefined &&
    Number(values.fewest) > Number(values.most);
  const problems = [
    numberProblem(values.most, true),
    numberProblem(values.fewest, true),
    ...(fewestTooMany ? ['The fewest is more than the most.'] : []),
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
      <Fieldset
        legend="Basics"
        note={admin ? 'What the contest is called, and what it is about.' : ADMIN_ONLY}
      >
        <FieldBox name="name">
          <TextInput
            label="Name"
            value={values.name}
            onChange={(value) => set('name', value)}
            disabled={!admin}
          />
        </FieldBox>
        <FieldBox name="description">
          <Textarea
            label="Description"
            value={values.description}
            onChange={(value) => set('description', value)}
            readOnly={!admin}
            rows={3}
          />
        </FieldBox>
      </Fieldset>

      <Fieldset
        legend="Schedule"
        note="When the contest runs. Each task opens at the start and closes at the end unless its row in the tasks list says otherwise."
      >
        <div className={classes.grid}>
          <FieldBox name="start">
            <TimeField
              label="Start"
              value={values.start}
              raw={raw('start')}
              onChange={(value) => set('start', value)}
            />
          </FieldBox>
          <FieldBox name="end">
            <TimeField
              label="End"
              value={values.end}
              raw={raw('end')}
              onChange={(value) => set('end', value)}
            />
          </FieldBox>
        </div>
      </Fieldset>

      <Fieldset
        legend="Teams"
        note={
          read.unreadable.includes('entrants')
            ? 'These settings cannot be read here.'
            : 'Whether people enter alone or in teams. A team registers once and shares its submissions, its extra time and its questions.'
        }
      >
        <FieldBox name="most">
          <RadioGroup
            label="People enter"
            value={teams ? 'teams' : 'alone'}
            options={[
              { value: 'alone', label: 'Alone' },
              { value: 'teams', label: 'In teams' },
            ]}
            onChange={(how) =>
              setValues((before) =>
                how === 'teams'
                  ? {
                      ...before,
                      most:
                        before.most === '' || before.most === '1' ? '3' : before.most,
                    }
                  : { ...before, most: '', fewest: '' },
              )
            }
          />
        </FieldBox>
        {teams && (
          <>
            <div className={classes.grid}>
              <FieldBox name="most">
                <NumberField
                  label="Most people in a team"
                  value={values.most}
                  onChange={(value) => set('most', value)}
                  whole
                />
              </FieldBox>
              <FieldBox name="fewest">
                <NumberField
                  label="Fewest people in a team"
                  value={values.fewest}
                  onChange={(value) => set('fewest', value)}
                  placeholder="1, so one person may enter alone"
                  error={fewestTooMany ? 'More than the most.' : undefined}
                  whole
                />
              </FieldBox>
            </div>
            <FieldBox name="locks">
              <RadioGroup
                label="Teams are fixed"
                description="Until then members invite others, rename their team and leave it; after, only organisers change who is in it."
                value={values.locks === '' ? 'start' : values.locks}
                options={[
                  { value: 'start', label: 'When the contest starts' },
                  { value: 'first_submission', label: 'At a team’s first submission' },
                ]}
                onChange={(locks) => set('locks', locks)}
              />
            </FieldBox>
          </>
        )}
      </Fieldset>

      <Fieldset
        legend="When grading fails"
        note="A grading can fail on the platform's side, and organisers may cancel one. This is what such a submission counts as meanwhile; organisers can still choose for one submission at a time from its gradings."
      >
        <FieldBox name="on_system_error">
          <RadioGroup
            label="A submission whose grading failed"
            value={values.onSystemError === '' ? 'grading' : values.onSystemError}
            options={[
              { value: 'grading', label: 'Waits for the organisers' },
              { value: 'last_result', label: 'Uses its last good result' },
            ]}
            onChange={(value) => set('onSystemError', value)}
          />
        </FieldBox>
        <BodyText tone="secondary">
          {values.onSystemError === 'last_result'
            ? 'It counts as the latest earlier grading of it that finished with a result, while it has one.'
            : 'It counts as still being graded until an organiser grades it again, and as nothing once cancelled.'}
        </BodyText>
      </Fieldset>

      <div className={shared.actions}>
        <Button type="submit" loading={busy} disabled={!changed || problems.length > 0}>
          Save settings
        </Button>
        {changed && <BodyText tone="secondary">Unsaved changes</BodyText>}
      </div>
    </form>
  );
}
