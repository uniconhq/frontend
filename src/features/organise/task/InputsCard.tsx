import { useState } from 'react';
import type { DeclaredInput } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { FieldBox } from '../contest/ContestFile';
import { NumberField } from '../forms/fields';
import { heldTheOtherWay, type InputValues } from '../forms/task-values';
import { BuildCard, CardPart } from './BuildCard';
import { inputTitle } from './build-data';
import shared from '../organise.module.css';
import classes from './task.module.css';

/** A choice of `options`, keeping a value the file has that is not one of them. */
function choices(options: string[], value: string) {
  const all = value === '' || options.includes(value) ? options : [value, ...options];
  return all.map((option) => ({ value: option, label: option }));
}

const YES_NO = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

/** Each option chosen, in the order the workflow declares them. */
function chosenOf(text: string): string[] {
  return text
    .split(',')
    .map((option) => option.trim())
    .filter((option) => option !== '');
}

type Change = (change: Partial<InputValues>) => void;

/**
 * What the task gives an input the workflow asks it for, as a field of the
 * input's type: a number, yes or no, one of its options, text or one of the
 * org's secrets, or a file or folder of the task by its path.
 */
function ValueField({
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
  const label = inputTitle(declared);
  const info = declared.help ?? undefined;
  const empty = input.value.trim() === '';
  const hint = declared.optional
    ? 'Leave it empty to use none.'
    : empty
      ? 'Needed: until it is set, a save is kept as a draft.'
      : undefined;
  const { type } = declared;
  if (type === 'number') {
    return (
      <NumberField
        label={label}
        value={input.value}
        onChange={(value) => onChange({ value })}
        hint={hint}
        info={info}
        disabled={disabled}
      />
    );
  }
  if (type === 'boolean' || type === 'enum') {
    return (
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
            ? 'A file of the task, by where it is in the task’s files.'
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
 * shown to them, and for a choice the options they may pick from and the one
 * picked to start with; a starting value for text, yes or no, or a number,
 * with a number's least and most; the most a file or folder may hold.
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
  const offered =
    chosen.length === 0 ? options : options.filter((option) => chosen.includes(option));
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
            label="Filled in to start with"
            value={input.default}
            onChange={(value) => onChange({ default: value })}
            disabled={disabled}
          />
        )}
        {(type === 'boolean' || type === 'enum') && (
          <Select
            label="Chosen to start with"
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
              label="Filled in to start with"
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
            label={declared.per_test ? 'Maximum size of all its files' : 'Maximum size'}
            value={input.maxSize}
            onChange={(maxSize) => onChange({ maxSize })}
            placeholder="10MB"
            description="Such as 500KB or 2MB; 10MB if left empty."
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
              The settings also offer {strays.join(', ')}, which the workflow does not
              have; ticking here leaves {strays.length === 1 ? 'it' : 'them'} out.
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

/** One input the workflow declares, as a box of its own named for it. */
function DeclaredItem({
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
  const other = heldTheOtherWay(input);
  return (
    <FieldBox name={declared.id}>
      <div className={classes.item} role="group" aria-label={inputTitle(declared)}>
        {declared.contestant && (
          <div className={classes.itemHead}>
            <h4 className={classes.itemTitle}>{declared.title ?? declared.id}</h4>
            <span className={classes.id}>
              {declared.id}
              {declared.per_test ? ', one file per test' : ''}
            </span>
          </div>
        )}
        {other && (
          <BodyText tone="secondary">
            {declared.contestant
              ? 'The settings give this a value, but entrants give it under this workflow: saving replaces the value with what is set here.'
              : 'The settings let entrants give this, but under this workflow the task sets it: saving replaces that with the value here.'}
          </BodyText>
        )}
        {declared.contestant ? (
          <EntrantFields
            declared={declared}
            input={input}
            onChange={onChange}
            disabled={disabled}
          />
        ) : (
          <div className={classes.single}>
            <ValueField
              declared={declared}
              input={input}
              onChange={onChange}
              disabled={disabled}
            />
            <span className={classes.id}>{declared.id}</span>
          </div>
        )}
      </div>
    </FieldBox>
  );
}

/**
 * An input when the workflow cannot be read, so its declarations are not
 * known: what the settings hold for it, as a value or as what entrants see
 * of it, which the save checks against the workflow.
 */
function UnknownItem({
  input,
  onChange,
  onRemove,
  disabled,
}: {
  input: InputValues;
  onChange: Change;
  onRemove: () => void;
  disabled: boolean;
}) {
  const id = input.id;
  return (
    <FieldBox name={id}>
      <div className={classes.item} role="group" aria-label={id}>
        <div className={classes.itemHead}>
          <h4 className={classes.itemTitle}>{id}</h4>
          <span className={classes.id}>
            {input.kind === 'details' ? 'entrants give it' : 'the task sets it'}
          </span>
        </div>
        {input.kind === 'details' ? (
          <div className={classes.grid}>
            <TextInput
              label="Label shown to entrants"
              value={input.label}
              onChange={(label) => onChange({ label })}
              placeholder={id}
              disabled={disabled}
            />
            <TextInput
              label="Options entrants choose from"
              value={input.options}
              onChange={(options) => onChange({ options })}
              description="For a choice, separated by commas."
              disabled={disabled}
            />
            <TextInput
              label="Filled in to start with"
              value={input.default}
              onChange={(value) => onChange({ default: value })}
              disabled={disabled}
            />
            <NumberField
              label="Smallest allowed"
              value={input.min}
              onChange={(min) => onChange({ min })}
              hint="For a number."
              disabled={disabled}
            />
            <NumberField
              label="Largest allowed"
              value={input.max}
              onChange={(max) => onChange({ max })}
              hint="For a number."
              disabled={disabled}
            />
            <TextInput
              label="Maximum size"
              value={input.maxSize}
              onChange={(maxSize) => onChange({ maxSize })}
              placeholder="10MB"
              description="For files, such as 1MB."
              disabled={disabled}
            />
          </div>
        ) : (
          <div className={classes.grid}>
            <TextInput
              label="Value"
              value={input.value}
              onChange={(value) => onChange({ value })}
              description={
                input.secret
                  ? 'The name the org keeps the secret under.'
                  : 'A number, true or false, a file of the task, or text.'
              }
              disabled={disabled}
            />
            <Checkbox
              label="Use one of the org’s secrets"
              checked={input.secret}
              onChange={(secret) => onChange({ secret })}
              disabled={disabled}
            />
          </div>
        )}
        {!disabled && (
          <div className={shared.actions}>
            <Button
              size="xs"
              variant="secondary"
              onClick={() =>
                onChange({ kind: input.kind === 'details' ? 'value' : 'details' })
              }
              label={`Make ${id} ${input.kind === 'details' ? 'set by the task' : 'given by entrants'}`}
            >
              {input.kind === 'details' ? 'The task sets it' : 'Entrants give it'}
            </Button>
            <Button
              size="xs"
              variant="danger"
              onClick={onRemove}
              label={`Remove ${id}`}
            >
              Remove
            </Button>
          </div>
        )}
      </div>
    </FieldBox>
  );
}

/** Adding an input by its id, when the workflow's own list cannot be read. */
function AddUnknown({
  taken,
  onAdd,
}: {
  taken: string[];
  onAdd: (id: string, kind: InputValues['kind']) => void;
}) {
  const [id, setId] = useState('');
  const trimmed = id.trim();
  const clash = taken.includes(trimmed);
  const add = (kind: InputValues['kind']) => {
    onAdd(trimmed, kind);
    setId('');
  };
  return (
    <div className={classes.grid}>
      <TextInput
        label="Another input, by its name in the workflow"
        value={id}
        onChange={setId}
        description={clash ? 'There is an input with this name already.' : undefined}
      />
      <div className={shared.actions}>
        <Button
          size="xs"
          variant="secondary"
          disabled={trimmed === '' || clash}
          onClick={() => add('value')}
        >
          Add one the task sets
        </Button>
        <Button
          size="xs"
          variant="secondary"
          disabled={trimmed === '' || clash}
          onClick={() => add('details')}
        >
          Add one entrants give
        </Button>
      </div>
    </div>
  );
}

/**
 * The Inputs card: the form the workflow's inputs make, in the order an
 * organiser thinks of them. First what entrants submit (the inputs they
 * give: what they see of each, the choices they have and how much they may
 * send), then the limits and settings the task gives a value. Each input is
 * named by its title and unit from the workflow, its help behind an ⓘ, and
 * its id small beside it. When the workflow cannot be read, the inputs the
 * settings have are shown as they are, to keep or remove.
 */
export function InputsCard({
  declared,
  workflowProblem,
  inputs,
  onChange,
  onRemove,
  onAdd,
  disabled,
}: {
  /** The inputs the workflow declares, or null when it cannot be read. */
  declared: DeclaredInput[] | null;
  /** Why the workflow cannot be read, when it cannot. */
  workflowProblem: string | null;
  inputs: InputValues[];
  onChange: (id: string, change: Partial<InputValues>) => void;
  onRemove: (id: string) => void;
  onAdd: (id: string, kind: InputValues['kind']) => void;
  disabled: boolean;
}) {
  const line =
    'What entrants submit, and the limits and settings the workflow asks the task for.';
  if (declared === null) {
    return (
      <BuildCard id="inputs" title="Inputs" line={line}>
        <BodyText>
          {workflowProblem ?? 'The workflow cannot be read'} The inputs below are what
          the settings hold; the save checks them against the workflow.
        </BodyText>
        {inputs.length === 0 ? (
          <BodyText tone="secondary">The settings give no inputs.</BodyText>
        ) : (
          inputs.map((input) => (
            <UnknownItem
              key={input.id}
              input={input}
              onChange={(change) => onChange(input.id, change)}
              onRemove={() => onRemove(input.id)}
              disabled={disabled}
            />
          ))
        )}
        {!disabled && (
          <AddUnknown taken={inputs.map((input) => input.id)} onAdd={onAdd} />
        )}
      </BuildCard>
    );
  }

  const entrants = declared.filter((input) => input.contestant);
  const task = declared.filter((input) => !input.contestant);
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
        disabled={disabled}
      />
    );
  };

  return (
    <BuildCard id="inputs" title="Inputs" line={line}>
      <CardPart
        title="What entrants submit"
        line="What they see of each part of a submission, and how much they may send."
      >
        {entrants.length === 0 ? (
          <BodyText tone="secondary">The workflow asks entrants for nothing.</BodyText>
        ) : (
          entrants.map(item)
        )}
      </CardPart>
      <CardPart
        title="Limits and settings"
        line="What the task sets for every submission, such as its time and memory limits."
      >
        {task.length === 0 ? (
          <BodyText tone="secondary">The workflow asks the task for nothing.</BodyText>
        ) : (
          task.map(item)
        )}
      </CardPart>
      {undeclared.length > 0 && (
        <CardPart
          title="Not used by this workflow"
          line="The settings give these, but the workflow has no such input, so a save is refused until they are removed."
        >
          {undeclared.map((input) => (
            <div key={input.id} className={classes.item}>
              <div className={classes.itemHead}>
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
              </div>
            </div>
          ))}
        </CardPart>
      )}
    </BuildCard>
  );
}
