import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { $api } from '@/api/query';
import type { DeclaredField, DeclaredInput, WorkflowForm } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { treeQuery, type Place } from '../files/place';
import shared from '../organise.module.css';
import { DefinitionFile, type FormProps } from './DefinitionFile';
import { Fieldset, NumberField } from './fields';
import { numberProblem } from './yaml-doc';
import {
  emptyInput,
  heldTheOtherWay,
  readTask,
  writeTask,
  type GroupValues,
  type InputValues,
  type TaskValues,
} from './task-values';
import classes from './forms.module.css';

const ADMIN_ONLY = 'Only an admin of the task changes these.';
const SHOWS = [
  { value: 'always', label: 'always: everything once graded' },
  { value: 'verdict', label: 'verdict: its outcome now, its tests at the reveal' },
  { value: 'after_close', label: 'after_close: everything at the reveal' },
];
const TESTS = 'tests';

/**
 * `task.yaml` as fields, with the file as text in the next tab. The test
 * groups are the folders under `tests/`, read beside the file, so a folder
 * with no entry yet shows up to be given one. The inputs are the ones the
 * task's workflow declares, read beside the file too, each as the kind and
 * type the workflow gives it; when the workflow cannot be read, the form
 * says why and edits the entries the file has.
 */
export function TaskSettings({ place, admin }: { place: Place; admin: boolean }) {
  return (
    <DefinitionFile place={place} path="task.yaml" label="The task's settings">
      {(props) => <WithFolders {...props} place={place} admin={admin} />}
    </DefinitionFile>
  );
}

function WithFolders(props: FormProps & { place: Place; admin: boolean }) {
  const { place } = props;
  const tree = useQuery({ ...treeQuery(place, TESTS), retry: false });
  // Read afresh each time the form opens, which includes after each save,
  // since a save may name another workflow.
  const workflow = $api.useQuery(
    'get',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/workflow-form',
    {
      params: {
        path: {
          org: place.org,
          contest: place.contest,
          task: place.kind === 'task' ? place.task : '',
        },
      },
    },
    { enabled: place.kind === 'task', retry: false, gcTime: 0 },
  );
  if (tree.isPending || (place.kind === 'task' && workflow.isPending)) {
    return <PageSkeleton rows={6} />;
  }
  const folders = (tree.data ?? [])
    .filter((entry) => entry.kind === 'directory')
    .map((entry) => entry.path.slice(TESTS.length + 1));
  return (
    <TaskForm
      {...props}
      folders={folders}
      treeFailed={tree.isError}
      workflowForm={workflow.data ?? null}
    />
  );
}

function TaskForm({
  doc,
  busy,
  onSave,
  admin,
  folders,
  treeFailed,
  workflowForm,
}: FormProps & {
  admin: boolean;
  folders: string[];
  treeFailed: boolean;
  workflowForm: WorkflowForm | null;
}) {
  const declared = workflowForm?.problem === null ? workflowForm : null;
  const [read] = useState(() => readTask(doc, folders, declared?.inputs ?? null));
  const [values, setValues] = useState<TaskValues>(read.values);
  const [newInput, setNewInput] = useState('');
  const set = <K extends keyof TaskValues>(key: K, value: TaskValues[K]) =>
    setValues((before) => ({ ...before, [key]: value }));
  const setInput = (id: string, change: Partial<InputValues>) =>
    setValues((before) => ({
      ...before,
      inputs: before.inputs.map((input) =>
        input.id === id ? { ...input, ...change } : input,
      ),
    }));
  const setGroup = (name: string, change: Partial<GroupValues>) =>
    setValues((before) => ({
      ...before,
      groups: before.groups.map((group) =>
        group.name === name ? { ...group, ...change } : group,
      ),
    }));

  const unreadable = (key: string) => read.unreadable.includes(key);
  const changed =
    JSON.stringify(values) !== JSON.stringify(read.values) ||
    values.inputs.some(heldTheOtherWay);
  const problems = [
    numberProblem(values.max, true),
    numberProblem(values.rateCount, true),
    numberProblem(values.ratePer, true),
    ...values.inputs.flatMap((input) => [
      numberProblem(input.min),
      numberProblem(input.max),
      input.type === 'number'
        ? numberProblem(input.kind === 'value' ? input.value : input.default)
        : undefined,
    ]),
    ...values.groups.flatMap((group) => [
      numberProblem(group.each),
      numberProblem(group.worst),
      numberProblem(group.pass),
      numberProblem(group.passAt),
      ...group.weights.map((row) => numberProblem(row.weight)),
    ]),
  ].filter((problem) => problem !== undefined);
  const newId = newInput.trim();
  const idTaken = values.inputs.some((input) => input.id === newId);

  const addInput = (kind: InputValues['kind']) => {
    set('inputs', [...values.inputs, emptyInput(newId, kind)]);
    setNewInput('');
  };
  const removeInput = (id: string) =>
    set(
      'inputs',
      values.inputs.filter((kept) => kept.id !== id),
    );

  return (
    <form
      className={classes.form}
      aria-label="Task settings"
      onSubmit={(event) => {
        event.preventDefault();
        onSave((fresh) =>
          writeTask(fresh, read.values, values, { admin, unreadable: read.unreadable }),
        );
      }}
    >
      <Fieldset legend="The task">
        <TextInput
          label="Name"
          value={values.name}
          onChange={(value) => set('name', value)}
          description={admin ? undefined : ADMIN_ONLY}
          disabled={!admin}
        />
        <TextInput
          label="Workflow"
          value={values.workflow}
          onChange={(value) => set('workflow', value)}
          description="owner/name@version, such as unicon/classic@v2. The save pins it."
        />
      </Fieldset>

      {declared !== null && !unreadable('inputs') ? (
        <DeclaredInputs
          form={declared}
          inputs={values.inputs}
          workflowChanged={values.workflow !== read.values.workflow}
          onChange={setInput}
          onAdd={(input) =>
            set('inputs', [
              ...values.inputs,
              emptyInput(input.id, input.contestant ? 'details' : 'value', input.type),
            ])
          }
          onRemove={removeInput}
        />
      ) : (
        <Fieldset
          legend="Inputs"
          note={
            unreadable('inputs')
              ? 'inputs is not a mapping the form can read; edit it as text.'
              : workflowForm?.problem
                ? `The workflow's inputs could not be read: ${workflowForm.problem} The form edits the entries task.yaml has; the save checks them against the workflow.`
                : workflowForm === null
                  ? "The workflow's inputs could not be read, so the form edits the entries task.yaml has; the save checks them against the workflow."
                  : 'The workflow declares the inputs. One the contestant gives takes form details; any other takes its value. The save checks them against the workflow.'
          }
        >
          {values.inputs.length > 0 && (
            <ul className={classes.entries} aria-label="Inputs">
              {values.inputs.map((input) => (
                <InputEntry
                  key={input.id}
                  input={input}
                  onChange={(change) => setInput(input.id, change)}
                  onRemove={() => removeInput(input.id)}
                />
              ))}
            </ul>
          )}
          {!unreadable('inputs') && (
            <div className={classes.grid}>
              <TextInput
                label="New input's id"
                value={newInput}
                onChange={setNewInput}
                description={idTaken ? 'There is an input with this id.' : undefined}
              />
              <div className={shared.actions}>
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={newId === '' || idTaken}
                  onClick={() => addInput('value')}
                >
                  Add with a value
                </Button>
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={newId === '' || idTaken}
                  onClick={() => addInput('details')}
                >
                  Add the contestant's
                </Button>
              </div>
            </div>
          )}
        </Fieldset>
      )}

      <Fieldset
        legend="Credit"
        note={
          unreadable('credit')
            ? 'credit is not in a shape the form can read; edit it as text.'
            : 'What an accepted test earns.'
        }
      >
        <div className={classes.grid}>
          <Select
            label="An accepted test earns"
            value={values.credit.kind}
            options={[
              { value: 'none', label: '1' },
              { value: 'value', label: 'a value it reports, 0 to 1' },
              { value: 'relative', label: 'a value over the best reached' },
            ]}
            onChange={(kind) =>
              set('credit', {
                ...values.credit,
                kind: kind === 'value' || kind === 'relative' ? kind : 'none',
              })
            }
            disabled={unreadable('credit')}
          />
          {values.credit.kind !== 'none' && (
            <TextInput
              label="Value name"
              value={values.credit.name}
              onChange={(name) => set('credit', { ...values.credit, name })}
              disabled={unreadable('credit')}
            />
          )}
        </div>
      </Fieldset>

      <Fieldset
        legend="Test groups"
        note={
          unreadable('test_groups')
            ? 'test_groups is not a mapping of groups the form can read; edit it as text.'
            : treeFailed
              ? 'The folders under tests/ could not be read, so only the groups in the file are shown.'
              : 'One group per folder under tests/. The weights are relative: a group earns its share of the task. Empty fields are not set.'
        }
      >
        {declared !== null && declared.test.length > 0 && (
          <BodyText tone="secondary">
            Each test holds: {declared.test.map(fieldText).join(', ')}.
          </BodyText>
        )}
        {values.groups.length === 0 ? (
          <BodyText tone="secondary">No folder under tests/ and no group yet.</BodyText>
        ) : (
          <ul className={classes.entries} aria-label="Test groups">
            {values.groups.map((group) => (
              <GroupEntry
                key={group.name}
                group={group}
                treeKnown={!treeFailed}
                onChange={(change) => setGroup(group.name, change)}
                onRemove={() =>
                  set(
                    'groups',
                    values.groups.filter((kept) => kept.name !== group.name),
                  )
                }
              />
            ))}
          </ul>
        )}
      </Fieldset>

      <Fieldset
        legend="Submissions"
        note={
          unreadable('submissions')
            ? 'submissions is not a mapping the form can read; edit it as text.'
            : admin
              ? 'Per contestant, or per team. Empty: at most 50, one every 30 seconds.'
              : ADMIN_ONLY
        }
      >
        <div className={classes.grid}>
          <NumberField
            label="At most"
            value={values.max}
            onChange={(value) => set('max', value)}
            whole
            disabled={!admin || unreadable('submissions')}
          />
          <NumberField
            label="Rate: count"
            value={values.rateCount}
            onChange={(value) => set('rateCount', value)}
            hint="Submissions in any window"
            whole
            disabled={!admin || unreadable('submissions')}
          />
          <NumberField
            label="Rate: per seconds"
            value={values.ratePer}
            onChange={(value) => set('ratePer', value)}
            hint="The window, in seconds"
            whole
            disabled={!admin || unreadable('submissions')}
          />
        </div>
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

/** A test field as the form names it: its name, its type and an enum's options. */
function fieldText(field: DeclaredField): string {
  const options = field.options === null ? '' : `: ${field.options.join(', ')}`;
  return `${field.name} (${field.type}${options})`;
}

/** What an input's type takes, said under its value. */
const VALUE_HINT: Partial<Record<string, string>> = {
  number: 'A number.',
  file: "A file's path in the task, such as checker/checker.cpp.",
  folder: "A folder's path in the task; every file under it goes in.",
  text: 'Text.',
};

/**
 * The inputs the workflow declares, one entry each in its order, as the kind
 * it gives each: form details for the contestant's, a value for the rest.
 * One the file leaves out offers to be given; one the contestant gives, or
 * that is optional, may be left out again. An entry the workflow does not
 * declare is shown to be removed, since the save refuses it.
 */
function DeclaredInputs({
  form,
  inputs,
  workflowChanged,
  onChange,
  onAdd,
  onRemove,
}: {
  form: WorkflowForm;
  inputs: InputValues[];
  workflowChanged: boolean;
  onChange: (id: string, change: Partial<InputValues>) => void;
  onAdd: (input: DeclaredInput) => void;
  onRemove: (id: string) => void;
}) {
  const undeclared = inputs.filter(
    (input) => !form.inputs.some((declared) => declared.id === input.id),
  );
  const workflow = form.workflow ?? 'The workflow';
  return (
    <Fieldset
      legend="Inputs"
      note={
        workflowChanged
          ? `These are the inputs ${workflow} declares. Save the change of workflow to see the new one's.`
          : `The inputs ${workflow} declares. The contestant gives the ones marked so, which take form details; the task gives the rest a value.`
      }
    >
      {form.inputs.length === 0 && undeclared.length === 0 ? (
        <BodyText tone="secondary">The workflow declares no inputs.</BodyText>
      ) : (
        <ul className={classes.entries} aria-label="Inputs">
          {form.inputs.map((declared) => {
            const input = inputs.find((found) => found.id === declared.id);
            return (
              <DeclaredEntry
                key={declared.id}
                declared={declared}
                input={input}
                onChange={(change) => onChange(declared.id, change)}
                onAdd={() => onAdd(declared)}
                onRemove={() => onRemove(declared.id)}
              />
            );
          })}
          {undeclared.map((input) => (
            <li key={input.id}>
              <Fieldset
                legend={`${input.id}: not declared`}
                note="The workflow declares no input with this id, so the save refuses the task until it is removed."
              >
                <div className={shared.actions}>
                  <Button
                    size="xs"
                    variant="danger"
                    onClick={() => onRemove(input.id)}
                    label={`Remove ${input.id}`}
                  >
                    Remove
                  </Button>
                </div>
              </Fieldset>
            </li>
          ))}
        </ul>
      )}
    </Fieldset>
  );
}

function DeclaredEntry({
  declared,
  input,
  onChange,
  onAdd,
  onRemove,
}: {
  declared: DeclaredInput;
  input: InputValues | undefined;
  onChange: (change: Partial<InputValues>) => void;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const { id, contestant, optional } = declared;
  const legend = `${id}: ${contestant ? "the contestant's" : 'a value'}, ${declared.type}${declared.per_test ? ', one per test' : ''}`;

  if (input === undefined) {
    const note = contestant
      ? 'Not in task.yaml, so the contestant gets the defaults.'
      : optional
        ? 'Optional, and not given.'
        : 'Not given, and the workflow needs it: the save refuses the task until it has a value.';
    return (
      <li>
        <Fieldset legend={legend} note={note}>
          <div className={shared.actions}>
            <Button
              size="xs"
              variant="secondary"
              onClick={onAdd}
              label={contestant ? `Give ${id} form details` : `Give ${id} a value`}
            >
              {contestant ? 'Give it form details' : 'Give it a value'}
            </Button>
          </div>
        </Fieldset>
      </li>
    );
  }

  const note = heldTheOtherWay(input)
    ? contestant
      ? 'task.yaml gives it a value, but the contestant gives this one: saving writes its form details in its place.'
      : 'task.yaml gives it form details, but the task gives this one a value: saving writes the value in their place.'
    : undefined;
  return (
    <li>
      <Fieldset legend={legend} note={note}>
        {contestant ? (
          <DetailsFields declared={declared} input={input} onChange={onChange} />
        ) : (
          <ValueField declared={declared} input={input} onChange={onChange} />
        )}
        {(contestant || optional) && (
          <div className={shared.actions}>
            <Button
              size="xs"
              variant="secondary"
              onClick={onRemove}
              label={`Leave ${id} out`}
            >
              Leave it out
            </Button>
          </div>
        )}
      </Fieldset>
    </li>
  );
}

/** A choice of `options`, keeping a value the file has that is not one of them. */
function choices(options: string[], value: string) {
  const all = value === '' || options.includes(value) ? options : [value, ...options];
  return all.map((option) => ({ value: option, label: option }));
}

/** The value of an input the task gives, as a field for its type. */
function ValueField({
  declared,
  input,
  onChange,
}: {
  declared: DeclaredInput;
  input: InputValues;
  onChange: (change: Partial<InputValues>) => void;
}) {
  const label = `${input.id} value`;
  const { type } = declared;
  if (type === 'number') {
    return (
      <NumberField
        label={label}
        value={input.value}
        onChange={(value) => onChange({ value })}
        hint={VALUE_HINT['number']}
      />
    );
  }
  if (type === 'boolean' || type === 'enum') {
    const options = type === 'boolean' ? ['true', 'false'] : (declared.options ?? []);
    return (
      <Select
        label={label}
        value={input.value}
        options={choices(options, input.value)}
        placeholder="Not set"
        onChange={(value) => onChange({ value })}
      />
    );
  }
  const secrets = type === 'text' || VALUE_HINT[type] === undefined;
  return (
    <div className={classes.grid}>
      <TextInput
        label={label}
        value={input.value}
        onChange={(value) => onChange({ value })}
        description={
          input.secret
            ? "The name of one of the org's secrets."
            : (VALUE_HINT[type] ?? `A value of type ${type}.`)
        }
      />
      {secrets && (
        <Checkbox
          label={`${input.id}: a secret of the org`}
          checked={input.secret}
          onChange={(secret) => onChange({ secret })}
        />
      )}
    </div>
  );
}

/** Each option chosen, in the order the workflow declares them. */
function chosenOf(text: string): string[] {
  return text
    .split(',')
    .map((option) => option.trim())
    .filter((option) => option !== '');
}

/**
 * The form details of an input the contestant gives, as its type takes
 * them: a label for any; the options offered, out of the workflow's, and a
 * default for a choice; a default for text or true-or-false; a default, a
 * least and a most for a number; and the most a file or folder may hold.
 */
function DetailsFields({
  declared,
  input,
  onChange,
}: {
  declared: DeclaredInput;
  input: InputValues;
  onChange: (change: Partial<InputValues>) => void;
}) {
  const { id } = input;
  const { type } = declared;
  const options = declared.options ?? [];
  const chosen = chosenOf(input.options);
  const offered =
    chosen.length === 0 ? options : options.filter((o) => chosen.includes(o));
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
          label={`${id} label`}
          value={input.label}
          onChange={(label) => onChange({ label })}
          description="Empty: the id."
        />
        {(type === 'text' || type === 'boolean' || type === 'enum') &&
          (type === 'text' ? (
            <TextInput
              label={`${id} default`}
              value={input.default}
              onChange={(value) => onChange({ default: value })}
            />
          ) : (
            <Select
              label={`${id} default`}
              value={input.default}
              options={choices(
                type === 'boolean' ? ['true', 'false'] : offered,
                input.default,
              )}
              placeholder="Not set"
              onChange={(value) => onChange({ default: value })}
            />
          ))}
        {type === 'number' && (
          <>
            <NumberField
              label={`${id} default`}
              value={input.default}
              onChange={(value) => onChange({ default: value })}
            />
            <NumberField
              label={`${id} min`}
              value={input.min}
              onChange={(min) => onChange({ min })}
            />
            <NumberField
              label={`${id} max`}
              value={input.max}
              onChange={(max) => onChange({ max })}
            />
          </>
        )}
        {(type === 'file' || type === 'folder') && (
          <TextInput
            label={`${id} max size`}
            value={input.maxSize}
            onChange={(maxSize) => onChange({ maxSize })}
            description="Such as 1MB. Empty: 10MB."
          />
        )}
      </div>
      {type === 'enum' && (
        <Fieldset
          legend={`${id} options`}
          note={
            strays.length > 0
              ? `task.yaml also offers ${strays.join(', ')}, which the workflow does not declare; choosing here leaves those out.`
              : 'The ones the contestant picks from. None ticked: every one the workflow declares.'
          }
        >
          <div className={classes.grid}>
            {options.map((option) => (
              <Checkbox
                key={option}
                label={option}
                checked={chosen.includes(option)}
                onChange={(on) => toggle(option, on)}
              />
            ))}
          </div>
        </Fieldset>
      )}
    </>
  );
}

function InputEntry({
  input,
  onChange,
  onRemove,
}: {
  input: InputValues;
  onChange: (change: Partial<InputValues>) => void;
  onRemove: () => void;
}) {
  const id = input.id;
  return (
    <li>
      <Fieldset
        legend={`${id}: ${input.kind === 'details' ? "the contestant's" : 'a value'}`}
      >
        {input.kind === 'details' ? (
          <div className={classes.grid}>
            <TextInput
              label={`${id} label`}
              value={input.label}
              onChange={(label) => onChange({ label })}
              description="Empty: the id."
            />
            <TextInput
              label={`${id} options`}
              value={input.options}
              onChange={(options) => onChange({ options })}
              description="For a choice: the ones offered, separated by commas."
            />
            <TextInput
              label={`${id} default`}
              value={input.default}
              onChange={(value) => onChange({ default: value })}
            />
            <NumberField
              label={`${id} min`}
              value={input.min}
              onChange={(min) => onChange({ min })}
              hint="For a number."
            />
            <NumberField
              label={`${id} max`}
              value={input.max}
              onChange={(max) => onChange({ max })}
              hint="For a number."
            />
            <TextInput
              label={`${id} max size`}
              value={input.maxSize}
              onChange={(maxSize) => onChange({ maxSize })}
              description="For files, such as 1MB. Empty: 10MB."
            />
          </div>
        ) : (
          <div className={classes.grid}>
            <TextInput
              label={`${id} value`}
              value={input.value}
              onChange={(value) => onChange({ value })}
              description={
                input.secret
                  ? "The name of one of the org's secrets."
                  : 'A number, true or false, a path in the task, or text.'
              }
            />
            <Checkbox
              label="A secret of the org"
              checked={input.secret}
              onChange={(secret) => onChange({ secret })}
            />
          </div>
        )}
        <div className={shared.actions}>
          <Button
            size="xs"
            variant="secondary"
            onClick={() =>
              onChange({ kind: input.kind === 'details' ? 'value' : 'details' })
            }
            label={`Make ${id} ${input.kind === 'details' ? 'a value' : "the contestant's"}`}
          >
            {input.kind === 'details' ? 'Give it a value' : "Make it the contestant's"}
          </Button>
          <Button size="xs" variant="danger" onClick={onRemove} label={`Remove ${id}`}>
            Remove
          </Button>
        </div>
      </Fieldset>
    </li>
  );
}

function GroupEntry({
  group,
  treeKnown,
  onChange,
  onRemove,
}: {
  group: GroupValues;
  treeKnown: boolean;
  onChange: (change: Partial<GroupValues>) => void;
  onRemove: () => void;
}) {
  const name = group.name;
  const note = !group.read
    ? 'A folder under tests/ with no entry in task.yaml yet; saving adds one.'
    : treeKnown && !group.folder
      ? `No folder tests/${name}/ holds a test, so the save will refuse this group until there is one, or it is removed.`
      : undefined;
  const setRow = (index: number, change: Partial<GroupValues['weights'][number]>) =>
    onChange({
      weights: group.weights.map((row, at) =>
        at === index ? { ...row, ...change } : row,
      ),
    });

  return (
    <li>
      <Fieldset legend={name} note={note}>
        <div className={classes.grid}>
          <NumberField
            label={`${name} each`}
            value={group.each}
            onChange={(each) => onChange({ each })}
            hint="Earns the mean credit of its tests."
          />
          <NumberField
            label={`${name} worst`}
            value={group.worst}
            onChange={(worst) => onChange({ worst })}
            hint="Earns its worst test's credit."
          />
          <NumberField
            label={`${name} pass`}
            value={group.pass}
            onChange={(pass) => onChange({ pass })}
            hint="Earns all of it when enough pass."
          />
          <NumberField
            label={`${name} pass at`}
            value={group.passAt}
            onChange={(passAt) => onChange({ passAt })}
            hint="The part that must pass. Empty: all."
          />
          <Select
            label={`${name} show`}
            value={group.show}
            options={
              group.show === '' || SHOWS.some((show) => show.value === group.show)
                ? SHOWS
                : [{ value: group.show, label: group.show }, ...SHOWS]
            }
            placeholder="Not set (always)"
            onChange={(show) => onChange({ show })}
          />
        </div>
        <BodyText tone="secondary">
          Test weights: each test weighs 1 unless set here.
        </BodyText>
        {group.weights.map((row, index) => (
          <div key={index} className={classes.grid}>
            <TextInput
              label={`${name} test`}
              value={row.test}
              onChange={(test) => setRow(index, { test })}
            />
            <NumberField
              label={`${name} test weight`}
              value={row.weight}
              onChange={(weight) => setRow(index, { weight })}
            />
            <div className={shared.actions}>
              <Button
                size="xs"
                variant="secondary"
                onClick={() =>
                  onChange({ weights: group.weights.filter((_, at) => at !== index) })
                }
                label={`Remove the weight of ${name}/${row.test}`}
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
        <div className={shared.actions}>
          <Button
            size="xs"
            variant="secondary"
            onClick={() =>
              onChange({ weights: [...group.weights, { test: '', weight: '' }] })
            }
            label={`Add a test weight to ${name}`}
          >
            Add a test weight
          </Button>
          {group.read && (!group.folder || !treeKnown) && (
            <Button
              size="xs"
              variant="danger"
              onClick={onRemove}
              label={`Remove ${name}`}
            >
              Remove the group
            </Button>
          )}
        </div>
      </Fieldset>
    </li>
  );
}
