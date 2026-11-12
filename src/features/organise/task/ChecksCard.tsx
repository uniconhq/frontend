import type { DeclaredInput } from '@/api/types';
import type { InputValues, TaskValues } from '../forms/task-values';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { Group } from '@/ui/layout';
import { FieldBox } from '../contest/ContestFile';
import { NumberField } from '../forms/fields';
import { BuildCard, CardPart } from './BuildCard';
import { FileSetting } from './FileSetting';
import { choices, offeredOf, YES_NO } from './input-choices';
import { stageInputFiles, stageStoredUpload, type StagedInput } from './input-files';
import {
  entrantInputs,
  freshKey,
  perRunEntrant,
  type CheckDraft,
} from './scoring-model';
import { useDraftRuns } from './draft-runs';
import { inputTitle, type TaskPlace } from './build-data';
import classes from './task.module.css';

const VERDICTS = [
  'accepted',
  'wrong_answer',
  'time_limit',
  'memory_limit',
  'output_limit',
  'runtime_error',
  'compile_error',
];

/**
 * How a check's file is chosen: it waits for the task's save, as a
 * setting's does, and `apply` names it in the check once read.
 */
export type CheckFiles = {
  staged: StagedInput[];
  stage: (
    work: Promise<StagedInput>,
    was: string,
    apply: (value: string) => void,
  ) => void;
  unstage: (id: string) => void;
};

/** A check's entrant input or one run's of it, as a field of the input's type. */
function CheckField({
  place,
  declared,
  input,
  label,
  value,
  files,
  disabled,
  onChange,
}: {
  place: TaskPlace;
  declared: DeclaredInput | undefined;
  input: InputValues;
  label: string;
  value: string;
  files: CheckFiles;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const type = declared?.type ?? input.type;
  if (type === 'number')
    return (
      <NumberField
        label={label}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    );
  if (type === 'boolean' || (type === 'enum' && declared !== undefined))
    return (
      <Select
        label={label}
        value={value}
        options={
          type === 'boolean' || declared === undefined
            ? YES_NO
            : choices(offeredOf(declared, input), value)
        }
        placeholder="Not set"
        onChange={onChange}
        disabled={disabled}
      />
    );
  if ((type === 'file' || type === 'folder') && declared !== undefined) {
    const named = { ...declared, title: label };
    return (
      <FileSetting
        place={place}
        declared={named}
        value={value}
        staged={files.staged.find((each) => each.id === value)}
        hint={undefined}
        onChoose={(chosen) =>
          files.stage(stageInputFiles(place, named, chosen, value), value, onChange)
        }
        onUseUpload={(upload) =>
          files.stage(stageStoredUpload(place, named, upload, value), value, onChange)
        }
        onUndo={() => {
          const undone = files.staged.find((each) => each.id === value);
          files.unstage(value);
          if (undone !== undefined) onChange(undone.was);
        }}
        onClear={() => onChange('')}
        disabled={disabled}
      />
    );
  }
  return (
    <TextInput label={label} value={value} onChange={onChange} disabled={disabled} />
  );
}

/**
 * Made-up submissions the save grades, each with the verdict or the values
 * it should get. A task with none saves as any other.
 */
export function ChecksCard({
  place,
  values,
  declared,
  files,
  disabled,
  onChange,
  onSubmit,
}: {
  place: TaskPlace;
  values: TaskValues;
  declared: readonly DeclaredInput[];
  files: CheckFiles;
  disabled: boolean;
  onChange: (checks: CheckDraft[]) => void;
  /** Changes one entrant input of a check, from what it holds when the change lands. */
  onSubmit: (
    key: string,
    input: string,
    next: (held: string | string[] | undefined) => string | string[],
  ) => void;
}) {
  const rows = useDraftRuns(place, values.axes, values.inputs).runs?.runs ?? [];
  const once = entrantInputs(values.inputs);
  const perRun = perRunEntrant(values.inputs, values.axes);
  const field = (
    check: CheckDraft,
    input: InputValues,
    label: string,
    at: number | null,
  ) => (
    <CheckField
      key={at === null ? input.id : `${input.id}:${String(at)}`}
      place={place}
      declared={declared.find((each) => each.id === input.id)}
      input={input}
      label={label}
      value={
        at === null
          ? textAt(check.submit[input.id])
          : listAt(check.submit[input.id], at)
      }
      files={files}
      disabled={disabled}
      onChange={(value) =>
        onSubmit(check.key, input.id, (held) => {
          if (at === null) return value;
          const list = Array.isArray(held) ? [...held] : rows.map(() => '');
          list[at] = value;
          return list;
        })
      }
    />
  );
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
      line="Made-up submissions that prove the task grades correctly. Each save grades them and is refused if one gets the wrong result. A task can have none."
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
            {once.map((input) => field(check, input, titleOf(input, declared), null))}
            {perRun.flatMap((id) => {
              const input = values.inputs.find((each) => each.id === id);
              return input === undefined
                ? []
                : rows.map((row, at) =>
                    field(
                      check,
                      input,
                      `${titleOf(input, declared)}, ${row.title}`,
                      at,
                    ),
                  );
            })}
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
              <Group key={`${expected.name}:${String(at)}`} gap={8} align="end">
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
              </Group>
            ))}
          </div>
          {!disabled && (
            <div className={classes.ownWidth}>
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
            </div>
          )}
          {!disabled && (
            <div className={classes.ownWidth}>
              <Button
                size="xs"
                variant="secondary"
                disabled={disabled}
                onClick={() =>
                  set(values.checks.filter((item) => item.key !== check.key))
                }
              >
                Remove this check
              </Button>
            </div>
          )}
        </CardPart>
      ))}
      {!disabled && (
        <div className={classes.ownWidth}>
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
        </div>
      )}
    </BuildCard>
  );
}

/** What the entrant's form calls the input: its label, else the workflow's title. */
function titleOf(input: InputValues, declared: readonly DeclaredInput[]): string {
  if (input.label !== '') return input.label;
  const found = declared.find((each) => each.id === input.id);
  return found === undefined ? input.id : inputTitle(found);
}

function textAt(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

function listAt(value: string | string[] | undefined, index: number): string {
  return Array.isArray(value) ? (value[index] ?? '') : '';
}
