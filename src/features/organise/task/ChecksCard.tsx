import type { TaskValues } from '../forms/task-values';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { FieldBox } from '../contest/ContestFile';
import { BuildCard, CardPart } from './BuildCard';
import {
  entrantInputs,
  freshKey,
  perRunEntrant,
  runsOf,
  type CheckDraft,
} from './scoring-model';
import classes from './task.module.css';

const VERDICTS = [
  'accepted',
  'wrong_answer',
  'time_limit',
  'memory_limit',
  'runtime_error',
  'compile_error',
];

/**
 * Made-up submissions the save grades, each with the verdict or the values
 * it should get. A task with none saves as any other.
 */
export function ChecksCard({
  values,
  disabled,
  onChange,
}: {
  values: TaskValues;
  disabled: boolean;
  onChange: (checks: CheckDraft[]) => void;
}) {
  const rows = runsOf(values.axes);
  const once = entrantInputs(values.inputs);
  const perRun = perRunEntrant(values.inputs, values.axes);
  const set = (checks: CheckDraft[]) => onChange(checks);
  const update = (key: string, change: Partial<CheckDraft>) =>
    set(
      values.checks.map((check) =>
        check.key === key ? { ...check, ...change } : check,
      ),
    );
  return (
    <BuildCard
      id="checks"
      title="Checks"
      line="A made-up submission the save grades, and what it should get. A task can have none."
    >
      {values.checks.length === 0 && (
        <BodyText>No checks yet. The next save publishes without grading one.</BodyText>
      )}
      {values.checks.map((check, index) => (
        <CardPart
          key={check.key}
          title={`Check ${String(index + 1)}`}
          line="The entrant's inputs, and the verdict or values it should get."
        >
          <div className={classes.grid}>
            {once.map((input) => (
              <TextInput
                key={input.id}
                label={input.label === '' ? input.id : input.label}
                value={textAt(check.submit[input.id])}
                disabled={disabled}
                onChange={(text) =>
                  update(check.key, { submit: { ...check.submit, [input.id]: text } })
                }
              />
            ))}
            {perRun.flatMap((id) =>
              rows.map((row, at) => (
                <TextInput
                  key={`${id}:${row.id}`}
                  label={`${id}, ${row.title}`}
                  value={listAt(check.submit[id], at)}
                  disabled={disabled}
                  onChange={(text) => {
                    const list = Array.isArray(check.submit[id])
                      ? [...check.submit[id]]
                      : rows.map(() => '');
                    list[at] = text;
                    update(check.key, { submit: { ...check.submit, [id]: list } });
                  }}
                />
              )),
            )}
          </div>
          <div className={classes.grid}>
            <FieldBox name={`check-${String(index)}`}>
              <Select
                label="Verdict every run gets"
                value={check.verdict}
                placeholder="No verdict"
                disabled={disabled}
                options={VERDICTS.map((verdict) => ({
                  value: verdict,
                  label: verdict,
                }))}
                onChange={(verdict) => update(check.key, { verdict })}
              />
            </FieldBox>
            {check.values.map((expected, at) => (
              <div key={`${expected.name}:${String(at)}`} className={classes.valueHead}>
                <Select
                  label="Value"
                  value={expected.name}
                  disabled={disabled}
                  options={values.scoreValues
                    .filter((value) => value.name !== '')
                    .map((value) => ({ value: value.name, label: value.name }))}
                  onChange={(name) =>
                    update(check.key, {
                      values: check.values.map((item, index) =>
                        index === at ? { ...item, name } : item,
                      ),
                    })
                  }
                />
                <TextInput
                  label="Should be"
                  value={expected.expected}
                  disabled={disabled}
                  onChange={(text) =>
                    update(check.key, {
                      values: check.values.map((item, index) =>
                        index === at ? { ...item, expected: text } : item,
                      ),
                    })
                  }
                />
              </div>
            ))}
          </div>
          <Button
            size="xs"
            variant="secondary"
            disabled={disabled}
            onClick={() =>
              update(check.key, {
                values: [...check.values, { name: '', expected: '' }],
              })
            }
          >
            Add a value it should get
          </Button>
          <Button
            size="xs"
            variant="secondary"
            disabled={disabled}
            onClick={() => set(values.checks.filter((item) => item.key !== check.key))}
          >
            Remove this check
          </Button>
        </CardPart>
      ))}
      <Button
        variant="secondary"
        disabled={disabled}
        onClick={() =>
          set([
            ...values.checks,
            { key: freshKey('c'), submit: {}, verdict: '', values: [] },
          ])
        }
      >
        Add a check
      </Button>
    </BuildCard>
  );
}

function textAt(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

function listAt(value: string | string[] | undefined, index: number): string {
  return Array.isArray(value) ? (value[index] ?? '') : '';
}
