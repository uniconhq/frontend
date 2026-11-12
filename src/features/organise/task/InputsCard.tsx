import type { DeclaredInput } from '@/api/types';
import type { PartTransfer } from '@/api/upload/parts';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { Chip } from '@/ui/Chip';
import { InfoTip } from '@/ui/InfoTip';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { Group } from '@/ui/layout';
import { FieldBox } from '../contest/ContestFile';
import { typeWords } from '../workflows/words';
import { NumberField } from '../forms/fields';
import type { Give, InputValues } from '../forms/task-values';
import { choices, chosenOf, offeredOf, YES_NO } from './input-choices';
import { BuildCard, CardPart } from './BuildCard';
import { inputTitle, type TaskPlace } from './build-data';
import { FileSetting } from './FileSetting';
import type { StagedInput } from './input-files';
import classes from './task.module.css';

type Change = (change: Partial<InputValues>) => void;

/**
 * What a setting that is a file or a folder is chosen with (M51): the task,
 * the files chosen for settings and waiting for the save, and what choosing
 * a file, choosing a stored upload and undoing do.
 */
export type InputFiles = {
  place: TaskPlace;
  staged: StagedInput[];
  onChoose: (declared: DeclaredInput, files: File[], was: string) => void;
  onUseUpload: (declared: DeclaredInput, upload: PartTransfer, was: string) => void;
  onUndo: (id: string) => void;
};

/**
 * What the task gives an input the workflow asks it for, as a field of the
 * input's type: a number, yes or no, one of its options, text or one of the
 * org's secrets, or a file or folder of the task by its path.
 */
function ValueField({
  declared,
  input,
  onChange,
  files,
  disabled,
}: {
  declared: DeclaredInput;
  input: InputValues;
  onChange: Change;
  files: InputFiles | undefined;
  disabled: boolean;
}) {
  const label = inputTitle(declared);
  const info = declared.help ?? undefined;
  const empty = input.value.trim() === '';
  const hint = declared.optional
    ? 'Leave it empty to use none.'
    : empty
      ? 'Required: until it is set, the task is saved as a draft and not published.'
      : undefined;
  const { type } = declared;
  if (type === 'number') {
    return (
      <div className={classes.narrow}>
        <NumberField
          label={label}
          value={input.value}
          onChange={(value) => onChange({ value })}
          hint={hint}
          info={info}
          disabled={disabled}
        />
      </div>
    );
  }
  if (type === 'boolean' || type === 'enum') {
    return (
      <div className={classes.narrow}>
        <Select
          label={label}
          value={input.value}
          options={
            type === 'boolean' ? YES_NO : choices(declared.options ?? [], input.value)
          }
          placeholder="Not set"
          description={hint}
          info={info}
          onChange={(value) => onChange({ value })}
          disabled={disabled}
        />
      </div>
    );
  }
  if ((type === 'file' || type === 'folder') && files !== undefined) {
    return (
      <FileSetting
        place={files.place}
        declared={declared}
        value={input.value}
        staged={files.staged.find((each) => each.id === declared.id)}
        hint={hint}
        onChoose={(chosen) => files.onChoose(declared, chosen, input.value)}
        onUseUpload={(upload) => files.onUseUpload(declared, upload, input.value)}
        onUndo={() => files.onUndo(declared.id)}
        onClear={declared.optional ? () => onChange({ value: '' }) : null}
        disabled={disabled}
      />
    );
  }
  if (type === 'file' || type === 'folder') {
    return (
      <TextInput
        label={label}
        value={input.value}
        onChange={(value) => onChange({ value })}
        placeholder={type === 'file' ? 'checker/checker.cpp' : 'data/'}
        description={
          hint ??
          (type === 'file'
            ? 'A file in the task, given by where it is among the task’s files.'
            : 'A folder of the task; every file under it goes in.')
        }
        info={info}
        disabled={disabled}
      />
    );
  }
  return (
    <div className={classes.grid}>
      <TextInput
        label={input.secret ? `${label}: the org’s secret` : label}
        value={input.value}
        onChange={(value) => onChange({ value })}
        description={input.secret ? 'The name the org keeps the secret under.' : hint}
        info={info}
        disabled={disabled}
      />
      <Checkbox
        label="Use one of the org’s secrets"
        checked={input.secret}
        onChange={(secret) => onChange({ secret })}
        disabled={disabled}
      />
    </div>
  );
}

/**
 * What entrants see of an input they give, as its type takes it: the label
 * shown to them, and for a choice the options they may pick from; a default
 * for a choice, text, yes or no, or a number, with a number's least and most; the most a file or folder may hold.
 */
function EntrantFields({
  declared,
  input,
  onChange,
  disabled,
}: {
  declared: DeclaredInput;
  input: InputValues;
  onChange: Change;
  disabled: boolean;
}) {
  const { type } = declared;
  const options = declared.options ?? [];
  const chosen = chosenOf(input.options);
  const offered = offeredOf(declared, input);
  const strays = chosen.filter((option) => !options.includes(option));
  const toggle = (option: string, on: boolean) =>
    onChange({
      options: options
        .filter((kept) => (kept === option ? on : chosen.includes(kept)))
        .join(', '),
    });

  return (
    <>
      <div className={classes.grid}>
        <TextInput
          label="Label shown to entrants"
          value={input.label}
          onChange={(label) => onChange({ label })}
          placeholder={declared.title ?? declared.id}
          disabled={disabled}
        />
        {type === 'text' && (
          <TextInput
            label="Default"
            value={input.default}
            onChange={(value) => onChange({ default: value })}
            disabled={disabled}
          />
        )}
        {(type === 'boolean' || type === 'enum') && (
          <Select
            label="Default"
            value={input.default}
            options={type === 'boolean' ? YES_NO : choices(offered, input.default)}
            placeholder="Nothing chosen"
            onChange={(value) => onChange({ default: value })}
            disabled={disabled}
          />
        )}
        {type === 'number' && (
          <>
            <NumberField
              label="Default"
              value={input.default}
              onChange={(value) => onChange({ default: value })}
              disabled={disabled}
            />
            <NumberField
              label="Smallest allowed"
              value={input.min}
              onChange={(min) => onChange({ min })}
              disabled={disabled}
            />
            <NumberField
              label="Largest allowed"
              value={input.max}
              onChange={(max) => onChange({ max })}
              disabled={disabled}
            />
          </>
        )}
        {(type === 'file' || type === 'folder') && (
          <TextInput
            label="Maximum size"
            value={input.maxSize}
            onChange={(maxSize) => onChange({ maxSize })}
            placeholder="Default"
            description="Such as 500KB or 2MB. The default if left empty."
            disabled={disabled}
          />
        )}
      </div>
      {type === 'enum' && (
        <fieldset className={classes.item}>
          <legend className={classes.partTitle}>
            Entrants can choose from (all of them, if none are ticked)
          </legend>
          {strays.length > 0 && (
            <BodyText tone="secondary">
              The task also offers {strays.join(', ')}, which the workflow does not
              have. Ticking any here leaves {strays.length === 1 ? 'it' : 'them'} out.
            </BodyText>
          )}
          <div className={classes.grid}>
            {options.map((option) => (
              <Checkbox
                key={option}
                label={option}
                checked={chosen.includes(option)}
                onChange={(on) => toggle(option, on)}
                disabled={disabled}
              />
            ))}
          </div>
        </fieldset>
      )}
    </>
  );
}

/**
 * One input the workflow declares, as a box of its own named for it: by its
 * title, or its key where the workflow gives it none, with its help behind
 * an ⓘ, as each setting's field has it (M45). The key is the workflow
 * author's word, so it is not shown beside a title.
 */
function DeclaredItem({
  declared,
  input,
  onChange,
  onGive,
  files,
  disabled,
}: {
  declared: DeclaredInput;
  input: InputValues;
  onChange: Change;
  onGive: (give: Give) => void;
  files: InputFiles | undefined;
  disabled: boolean;
}) {
  const give = input.give ?? (input.kind === 'details' ? 'entrant' : 'setting');
  const entrant = give === 'entrant';
  const perRun = give === 'per-run';
  return (
    <FieldBox name={declared.id}>
      <div className={classes.item} role="group" aria-label={inputTitle(declared)}>
        <Group gap="4px 12px" align="baseline" justify="space-between">
          <Group gap={4} wrap="nowrap">
            <h4 className={classes.itemTitle}>{declared.title ?? declared.id}</h4>
            {/* A value's field carries its help; the others have it here. */}
            {(entrant || perRun) && declared.help !== null && (
              <InfoTip about={declared.title ?? declared.id}>{declared.help}</InfoTip>
            )}
          </Group>
          <Chip tone="quiet">{typeWords(declared.type)}</Chip>
        </Group>
        <div className={classes.narrow}>
          <Select
            label="Who gives it"
            value={give}
            options={[
              { value: 'setting', label: 'You set one value' },
              { value: 'entrant', label: 'The entrant gives it' },
              { value: 'per-run', label: 'You set one for each run' },
            ]}
            onChange={(next) => onGive(next as Give)}
            disabled={disabled}
          />
        </div>
        {perRun ? (
          <BodyText size="sm" tone="secondary">
            A column in Runs.
          </BodyText>
        ) : entrant ? (
          <EntrantFields
            declared={declared}
            input={input}
            onChange={onChange}
            disabled={disabled}
          />
        ) : (
          <ValueField
            declared={declared}
            input={input}
            onChange={onChange}
            files={files}
            disabled={disabled}
          />
        )}
      </div>
    </FieldBox>
  );
}

/**
 * The Inputs card: the form the workflow's inputs make, in the order the
 * workflow declares them, each saying who gives it: the task, the entrant
 * (what they see of it, the choices they have and how much they may send),
 * or each run, as a column in Runs. Each input is named by its title from
 * the workflow, a number's unit after it, its help behind an ⓘ; a setting
 * that is a file or a folder has its own box to view, upload and replace it
 * (`FileSetting`). Inputs the task has that the workflow does not are listed
 * to remove. When the workflow cannot be read, the card asks for one, with why.
 */
export function InputsCard({
  declared,
  workflowProblem,
  inputs,
  onChange,
  onGive = () => undefined,
  onRemove,
  files,
  disabled,
}: {
  /** The inputs the workflow declares, or null when it cannot be read. */
  declared: DeclaredInput[] | null;
  /** How a setting that is a file or a folder is chosen, when the task can take one. */
  files?: InputFiles;
  /** Why the workflow cannot be read, when it cannot. */
  workflowProblem: string | null;
  inputs: InputValues[];
  onChange: (id: string, change: Partial<InputValues>) => void;
  onGive?: (id: string, give: Give) => void;
  onRemove: (id: string) => void;
  disabled: boolean;
}) {
  const line =
    'What the workflow needs, and who gives each: you once, the entrant when they submit, or a different one for every run.';
  if (declared === null) {
    return (
      <BuildCard id="inputs" title="Inputs" line={line}>
        <BodyText>Choose a workflow.</BodyText>
        {workflowProblem !== null && (
          <BodyText tone="secondary">{workflowProblem}</BodyText>
        )}
      </BuildCard>
    );
  }

  const undeclared = inputs.filter(
    (input) => !declared.some((found) => found.id === input.id),
  );
  const item = (each: DeclaredInput) => {
    const input = inputs.find((found) => found.id === each.id);
    return input === undefined ? null : (
      <DeclaredItem
        key={each.id}
        declared={each}
        input={input}
        onChange={(change) => onChange(each.id, change)}
        onGive={(give) => onGive(each.id, give)}
        files={files}
        disabled={disabled}
      />
    );
  };

  return (
    <BuildCard id="inputs" title="Inputs" line={line}>
      {declared.map(item)}
      {undeclared.length > 0 && (
        <CardPart
          title="Not used by this workflow"
          line="The task has these, but the workflow has no such input, so the task cannot be saved until they are removed."
        >
          {undeclared.map((input) => (
            <div key={input.id} className={classes.item}>
              <Group gap="4px 12px" align="baseline" justify="space-between">
                <span className={classes.id}>{input.id}</span>
                {!disabled && (
                  <Button
                    size="xs"
                    variant="danger"
                    onClick={() => onRemove(input.id)}
                    label={`Remove ${input.id}`}
                  >
                    Remove
                  </Button>
                )}
              </Group>
            </div>
          ))}
        </CardPart>
      )}
    </BuildCard>
  );
}
