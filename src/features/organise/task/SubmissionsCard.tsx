import { FieldBox } from '../contest/ContestFile';
import { NumberField } from '../forms/fields';
import type { WorkflowForm } from '@/api/types';
import type { TaskValues } from '../forms/task-values';
import { BuildCard } from './BuildCard';
import classes from './task.module.css';

/**
 * How many submissions an entrant may send. The card keeps the anchor
 * `tests`, so a link to the old tests card still opens it.
 */
export function SubmissionsCard({
  values,
  limits,
  admin,
  disabled,
  onChange,
}: {
  values: TaskValues;
  /** What the task allows when it sets nothing, as forge answers; null until read. */
  limits: WorkflowForm['limits'] | null;
  admin: boolean;
  disabled: boolean;
  onChange: (change: Partial<TaskValues>) => void;
}) {
  return (
    <BuildCard
      id="tests"
      title="Submissions"
      line="How many times each entrant may submit, and how often."
    >
      <div className={classes.grid}>
        <FieldBox name="max">
          <NumberField
            label="Most submissions"
            value={values.max}
            onChange={(value) => onChange({ max: value })}
            placeholder={limits === null ? undefined : String(limits.max)}
            disabled={disabled || !admin}
          />
        </FieldBox>
        <FieldBox name="count">
          <NumberField
            label="Submissions in a window"
            value={values.rateCount}
            onChange={(value) => onChange({ rateCount: value })}
            placeholder={limits === null ? undefined : String(limits.count)}
            disabled={disabled || !admin}
          />
        </FieldBox>
        <FieldBox name="per">
          <NumberField
            label="Length of the window (seconds)"
            value={values.ratePer}
            onChange={(value) => onChange({ ratePer: value })}
            placeholder={limits === null ? undefined : String(limits.per)}
            disabled={disabled || !admin}
          />
        </FieldBox>
      </div>
    </BuildCard>
  );
}
