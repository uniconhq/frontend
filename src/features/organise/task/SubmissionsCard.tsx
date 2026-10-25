import { FieldBox } from '../contest/ContestFile';
import { NumberField } from '../forms/fields';
import type { TaskValues } from '../forms/task-values';
import { BuildCard, CardPart } from './BuildCard';
import classes from './task.module.css';

/**
 * How many submissions an entrant may send. The card keeps the anchor
 * `tests`, so a link to the old tests card still opens it.
 */
export function SubmissionsCard({
  values,
  admin,
  disabled,
  onChange,
}: {
  values: TaskValues;
  admin: boolean;
  disabled: boolean;
  onChange: (change: Partial<TaskValues>) => void;
}) {
  const max = values.max;
  const rate =
    values.rateCount === '' && values.ratePer === ''
      ? 'at most 1 in any 30 seconds'
      : `at most ${values.rateCount === '' ? '1' : values.rateCount} in any ${values.ratePer === '' ? '30' : values.ratePer} seconds`;
  return (
    <BuildCard
      id="tests"
      title="Submissions"
      line={`Per entrant: at most ${max === '' ? '50' : max} submissions, and ${rate}.${admin ? '' : ' Only an admin of the task can change these.'}`}
    >
      <CardPart
        title="Submission rules"
        line="How many an entrant may send, and how often."
      >
        <div className={classes.grid}>
          <FieldBox name="max">
            <NumberField
              label="Most submissions"
              value={values.max}
              onChange={(value) => onChange({ max: value })}
              placeholder="50"
              whole
              disabled={disabled || !admin}
            />
          </FieldBox>
          <FieldBox name="count">
            <NumberField
              label="Submissions in a window"
              value={values.rateCount}
              onChange={(value) => onChange({ rateCount: value })}
              placeholder="1"
              whole
              disabled={disabled || !admin}
            />
          </FieldBox>
          <FieldBox name="per">
            <NumberField
              label="Length of the window (seconds)"
              value={values.ratePer}
              onChange={(value) => onChange({ ratePer: value })}
              placeholder="30"
              whole
              disabled={disabled || !admin}
            />
          </FieldBox>
        </div>
      </CardPart>
    </BuildCard>
  );
}
