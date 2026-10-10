import { useState } from 'react';
import { ActionMenu } from '@/ui/ActionMenu';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { SectionTitle } from '@/ui/SectionTitle';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { NumberText, numberText } from '../forms/yaml-doc';
import {
  clearPort,
  freeName,
  removeEntry,
  removeField,
  removeInput,
  removeStep,
  renameEntry,
  renameField,
  renameInput,
  renameStep,
  setEntry,
  setField,
  setInput,
  setPerTest,
  setUse,
  setValue,
  wire,
  type FieldFields,
  type InputFields,
  workflowOf,
} from './edit';
import {
  VALUE_TYPES,
  refLabel,
  refProblem,
  refsIn,
  wholeRef,
  refText,
  type FieldDecl,
  type InputDecl,
  type ReportEntry,
  type Workflow,
} from './model';
import type { Pinned } from './pins';
import { declared, raisingPorts, type PrimitiveInfo } from './primitives';
import {
  mayBeOptional,
  newProblem,
  reportable,
  reportRefusal,
  switchRefusal,
  valueRefusal,
  wireRefusal,
} from './rules';
import classes from './workflows.module.css';

/**
 * The panel beside the graph for what is selected: a step, with its id, its
 * primitive's version, whether it runs once or per test and a value for each
 * port without a wire; the inputs or test fields of a box, each declaration
 * offering exactly the keys the format allows it; the report's entries with
 * what each number means; and, with nothing selected, the palette. Every
 * change is an edit of the file in place, handed up as its new text.
 */

type Change = (next: string) => void;

const HANDLE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const REPORT_NAME = /^[a-z][a-z0-9_]*$/;
const RESERVED = ['outcome', 'points', 'penalty'];
const SCALARS = ['text', 'number', 'boolean', 'enum'];

/** Why `name` cannot be an id among `taken`, or null when it can. */
function handleProblem(name: string, taken: string[]): string | null {
  if (!HANDLE.test(name))
    return 'Lower case letters, digits, hyphens and underscores, starting with a letter or a digit, at most 40.';
  if (taken.includes(name)) return 'That is taken.';
  return null;
}

/** A field that applies its text when it is left or Enter is pressed, refusing with a reason. */
function CommitField({
  label,
  value,
  apply,
  description,
}: {
  label: string;
  value: string;
  /** Applies the text, or says why it cannot. */
  apply: (text: string) => string | null;
  description?: string;
}) {
  const [text, setText] = useState(value);
  const [shown, setShown] = useState(value);
  const [problem, setProblem] = useState<string | null>(null);
  if (shown !== value) {
    setShown(value);
    setText(value);
    setProblem(null);
  }
  return (
    <TextInput
      label={label}
      value={text}
      description={description}
      error={problem ?? undefined}
      onChange={setText}
      onCommit={() => {
        if (text === value) return;
        setProblem(apply(text));
      }}
    />
  );
}

/** A scalar written as the file would hold it typed into a field. */
function typed(text: string, type: string): string | NumberText {
  const number = type === 'number' ? numberText(text) : undefined;
  return number instanceof NumberText ? number : text;
}

function PortValue({
  text,
  workflow,
  primitives,
  index,
  port,
  change,
}: {
  text: string;
  workflow: Workflow;
  primitives: Map<string, PrimitiveInfo>;
  index: number;
  port: string;
  change: Change;
}) {
  const step = workflow.steps[index];
  const primitive = step !== undefined ? declared(primitives, step.use) : null;
  const decl = primitive?.inputs[port];
  const value = step?.with[port];
  if (step === undefined || decl === undefined) return null;
  const label = `${port} (${decl.type}${decl.optional ? ', optional' : ''})`;
  if (value?.kind === 'wire')
    return (
      <div className={classes.item}>
        <BodyText size="sm">
          {port} is wired from <code>{refLabel(value.ref)}</code>.
        </BodyText>
        <Button
          size="xs"
          variant="secondary"
          onClick={() => change(clearPort(text, index, port))}
        >
          Remove the wire to {port}
        </Button>
      </div>
    );
  const current =
    value === undefined
      ? ''
      : value.kind === 'literal'
        ? value.value instanceof NumberText
          ? value.value.text
          : String(value.value)
        : value.kind === 'text'
          ? value.text
          : JSON.stringify(value.raw);
  const apply = (raw: string | NumberText | boolean | undefined): string | null => {
    if (raw === undefined || raw === '') {
      change(clearPort(text, index, port));
      return null;
    }
    const whole = typeof raw === 'string' ? wholeRef(raw) : null;
    if (whole !== null) {
      const refused = wireRefusal(workflow, primitives, index, port, whole);
      if (refused !== null) return refused;
      change(wire(text, index, port, whole));
      return null;
    }
    const bad = typeof raw === 'string' ? refProblem(raw) : null;
    if (bad !== null) return bad;
    const written = (typeof raw === 'string' ? refsIn(raw) : []) ?? [];
    const refused = valueRefusal(workflow, primitives, index, port, raw, written);
    if (refused !== null) return refused;
    change(setValue(text, index, port, raw));
    return null;
  };
  if (decl.type === 'boolean')
    return (
      <Select
        label={label}
        value={current}
        placeholder="No value"
        options={[
          { value: 'true', label: 'true' },
          { value: 'false', label: 'false' },
        ]}
        onChange={(chosen) => apply(chosen === '' ? undefined : chosen === 'true')}
      />
    );
  if (decl.type === 'enum')
    return (
      <Select
        label={label}
        value={current}
        placeholder="No value"
        options={(decl.options ?? []).map((option) => ({
          value: option,
          label: option,
        }))}
        onChange={(chosen) => apply(chosen === '' ? undefined : chosen)}
      />
    );
  if (decl.type === 'file' || decl.type === 'folder')
    return (
      <BodyText size="sm" tone="secondary">
        {port} takes a {decl.type}: wire it from an input, a test field or a step’s
        output.
      </BodyText>
    );
  const insertable = [
    ...workflow.inputs
      .filter((input) => SCALARS.includes(input.type) && !input.optional)
      .map((input) => ({ kind: 'inputs' as const, name: input.id })),
    ...(step.perTest
      ? workflow.test
          .filter((field) => SCALARS.includes(field.type))
          .map((field) => ({ kind: 'test' as const, name: field.name }))
      : []),
  ];
  return (
    <div className={classes.stack}>
      <CommitField
        label={label}
        value={current}
        description={
          decl.type === 'text'
            ? 'Text; inputs and test fields can be written in as ${{ inputs.<id> }}.'
            : raisingPorts(primitive!).has(port)
              ? 'Raises a container limit, so it is known at the save.'
              : undefined
        }
        apply={(typedText) => apply(typed(typedText, decl.type))}
      />
      {decl.type === 'text' && insertable.length > 0 && (
        <ActionMenu
          text="Write in a value"
          label={`Write a value into ${port}`}
          entries={insertable.map((ref) => ({
            kind: 'item' as const,
            text: refLabel(ref),
            onSelect: () => {
              apply(
                `${current}${current === '' || /\s$/.test(current) ? '' : ' '}${refText(ref)}`,
              );
            },
          }))}
        />
      )}
    </div>
  );
}

export function StepPanel({
  text,
  workflow,
  primitives,
  pinned,
  index,
  change,
  onRemoved,
}: {
  text: string;
  workflow: Workflow;
  primitives: Map<string, PrimitiveInfo>;
  pinned: Pinned;
  index: number;
  change: Change;
  onRemoved: () => void;
}) {
  const [versionRefused, setVersionRefused] = useState<string | null>(null);
  const step = workflow.steps[index];
  if (step === undefined) return null;
  const primitive = declared(primitives, step.use);
  const versions = [...primitives.values()].filter(
    (found) =>
      found.problem === null && primitive !== null && found.name === primitive.name,
  );
  const switching = switchRefusal(workflow, index);
  const problems = [
    ...(pinned.steps.get(index) ?? []),
    ...Object.keys(step.with).flatMap(
      (port) => pinned.ports.get(`${String(index)}.${port}`) ?? [],
    ),
    ...Object.keys(primitive?.inputs ?? {})
      .filter((port) => !(port in step.with))
      .flatMap((port) => pinned.ports.get(`${String(index)}.${port}`) ?? []),
  ];
  return (
    <section className={classes.side} aria-label={`The step ${step.id}`}>
      <SectionTitle order={3}>Step {step.id}</SectionTitle>
      {problems.length > 0 && (
        <ul className={classes.problems} aria-label="Problems with this step">
          {problems.map((problem) => (
            <li key={`${problem.path} ${problem.message}`}>
              <code>{problem.path}</code>: {problem.message}
            </li>
          ))}
        </ul>
      )}
      <CommitField
        label="Id"
        value={step.id}
        description="Renaming carries every reference to it."
        apply={(id) => {
          const problem = handleProblem(
            id,
            workflow.steps.filter((_, at) => at !== index).map((other) => other.id),
          );
          if (problem === null) change(renameStep(text, index, id));
          return problem;
        }}
      />
      {versions.length > 0 ? (
        <Select
          label="Primitive"
          value={step.use}
          options={versions.map((found) => ({ value: found.ref, label: found.ref }))}
          error={versionRefused ?? undefined}
          onChange={(use) => {
            const written = setUse(text, index, use);
            const broken = newProblem(workflow, workflowOf(written), primitives);
            setVersionRefused(broken);
            if (broken === null) change(written);
          }}
        />
      ) : (
        <BodyText size="sm" tone="secondary">
          {step.use} is not a primitive the platform has now.
        </BodyText>
      )}
      <Checkbox
        label="Runs once per test"
        checked={step.perTest}
        disabled={switching !== null}
        description={switching ?? undefined}
        onChange={(checked) => change(setPerTest(text, index, checked))}
      />
      {Object.keys(primitive?.inputs ?? {}).map((port) => (
        <PortValue
          key={port}
          text={text}
          workflow={workflow}
          primitives={primitives}
          index={index}
          port={port}
          change={change}
        />
      ))}
      <div>
        <Button
          size="xs"
          variant="danger"
          onClick={() => {
            change(removeStep(text, index));
            onRemoved();
          }}
        >
          Remove the step {step.id}
        </Button>
      </div>
    </section>
  );
}

const TYPE_OPTIONS = VALUE_TYPES.map((type) => ({ value: type, label: type }));

function optionsText(options: string[] | null): string {
  return (options ?? []).join(', ');
}

function optionsOf(text: string): string[] {
  return text
    .split(',')
    .map((option) => option.trim())
    .filter((option) => option !== '');
}

function InputRow({
  text,
  workflow,
  primitives,
  input,
  pinned,
  change,
}: {
  text: string;
  workflow: Workflow;
  primitives: Map<string, PrimitiveInfo>;
  input: InputDecl;
  pinned: Pinned;
  change: Change;
}) {
  const [refused, setRefused] = useState<string | null>(null);
  const fields: InputFields = {
    type: input.type,
    contestant: input.contestant,
    options: input.options,
    per_test: input.perTest,
    optional: input.optional,
  };
  const update = (next: Partial<InputFields>) => {
    const merged = { ...fields, ...next };
    if (merged.type !== 'enum') merged.options = null;
    else if (merged.options === null || merged.options?.length === 0)
      merged.options = ['a', 'b'];
    if (!(merged.contestant && merged.type === 'file')) merged.per_test = false;
    if (merged.contestant) merged.optional = false;
    const written = setInput(text, input.id, merged);
    const broken = newProblem(workflow, workflowOf(written), primitives);
    setRefused(broken);
    if (broken === null) change(written);
  };
  const problems = pinned.inputs.get(input.id) ?? [];
  return (
    <li className={classes.primitive} aria-label={`The input ${input.id}`}>
      <CommitField
        label="Input id"
        value={input.id}
        apply={(id) => {
          const problem = handleProblem(
            id,
            workflow.inputs
              .filter((other) => other.id !== input.id)
              .map((other) => other.id),
          );
          if (problem === null) change(renameInput(text, input.id, id));
          return problem;
        }}
      />
      <Select
        label="Type"
        value={input.type}
        options={TYPE_OPTIONS}
        onChange={(type) => update({ type })}
      />
      <Checkbox
        label="The contestant gives it"
        checked={input.contestant}
        onChange={(contestant) => update({ contestant })}
      />
      {input.type === 'enum' && (
        <CommitField
          label="Options"
          description="Separated by commas."
          value={optionsText(input.options)}
          apply={(written) => {
            const options = optionsOf(written);
            if (options.length === 0) return 'An enum lists at least one option.';
            if (new Set(options).size !== options.length) return 'Each option once.';
            update({ options });
            return null;
          }}
        />
      )}
      {input.contestant && input.type === 'file' && (
        <Checkbox
          label="One file per test"
          checked={input.perTest}
          onChange={(perTest) => update({ per_test: perTest })}
        />
      )}
      {!input.contestant &&
        (input.optional || mayBeOptional(workflow, primitives, input.id)) && (
          <Checkbox
            label="A task may leave it out"
            checked={input.optional}
            onChange={(optional) => update({ optional })}
          />
        )}
      {problems.map((problem) => (
        <p key={problem.message} className={classes.problemText}>
          {problem.message}
        </p>
      ))}
      {refused !== null && (
        <p className={classes.problemText} role="alert">
          {refused}
        </p>
      )}
      <div>
        <Button
          size="xs"
          variant="secondary"
          onClick={() => change(removeInput(text, input.id))}
        >
          Remove the input {input.id}
        </Button>
      </div>
    </li>
  );
}

function FieldRow({
  text,
  workflow,
  primitives,
  field,
  pinned,
  change,
}: {
  text: string;
  workflow: Workflow;
  primitives: Map<string, PrimitiveInfo>;
  field: FieldDecl;
  pinned: Pinned;
  change: Change;
}) {
  const [refused, setRefused] = useState<string | null>(null);
  const fields: FieldFields = {
    type: field.type,
    options: field.options,
    public: field.public,
  };
  const update = (next: Partial<FieldFields>) => {
    const merged = { ...fields, ...next };
    if (merged.type !== 'enum') merged.options = null;
    else if (merged.options === null || merged.options?.length === 0)
      merged.options = ['a', 'b'];
    if (merged.type !== 'file' && merged.type !== 'folder') merged.public = false;
    const written = setField(text, field.name, merged);
    const broken = newProblem(workflow, workflowOf(written), primitives);
    setRefused(broken);
    if (broken === null) change(written);
  };
  const problems = pinned.fields.get(field.name) ?? [];
  return (
    <li className={classes.primitive} aria-label={`The test field ${field.name}`}>
      <CommitField
        label="Field name"
        value={field.name}
        apply={(name) => {
          if (name === 'test')
            return 'No field is named test, since test.yaml would match it.';
          const problem = handleProblem(
            name,
            workflow.test
              .filter((other) => other.name !== field.name)
              .map((other) => other.name),
          );
          if (problem === null) change(renameField(text, field.name, name));
          return problem;
        }}
      />
      <Select
        label="Type"
        value={field.type}
        options={TYPE_OPTIONS}
        onChange={(type) => update({ type })}
      />
      {field.type === 'enum' && (
        <CommitField
          label="Options"
          description="Separated by commas."
          value={optionsText(field.options)}
          apply={(written) => {
            const options = optionsOf(written);
            if (options.length === 0) return 'An enum lists at least one option.';
            update({ options });
            return null;
          }}
        />
      )}
      {(field.type === 'file' || field.type === 'folder') && (
        <Checkbox
          label="Served to contestants"
          checked={field.public}
          onChange={(shown) => update({ public: shown })}
        />
      )}
      {problems.map((problem) => (
        <p key={problem.message} className={classes.problemText}>
          {problem.message}
        </p>
      ))}
      {refused !== null && (
        <p className={classes.problemText} role="alert">
          {refused}
        </p>
      )}
      <div>
        <Button
          size="xs"
          variant="secondary"
          onClick={() => change(removeField(text, field.name))}
        >
          Remove the field {field.name}
        </Button>
      </div>
    </li>
  );
}

/** A new input's or field's id and type, added in place. */
function AddDeclaration({
  what,
  taken,
  onAdd,
}: {
  what: string;
  taken: string[];
  onAdd: (id: string, type: string) => void;
}) {
  const [id, setId] = useState('');
  const [type, setType] = useState('file');
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <form
      className={classes.item}
      aria-label={`Add ${what}`}
      onSubmit={(event) => {
        event.preventDefault();
        const found =
          handleProblem(id, taken) ??
          (what === 'a test field' && id === 'test' ? 'No field is named test.' : null);
        setProblem(found);
        if (found !== null) return;
        onAdd(id, type);
        setId('');
      }}
    >
      <TextInput
        label={`New ${what.replace(/^an? /, '')}`}
        value={id}
        onChange={setId}
        error={problem ?? undefined}
      />
      <Select label="Of type" value={type} options={TYPE_OPTIONS} onChange={setType} />
      <Button size="xs" type="submit">
        Add {what}
      </Button>
    </form>
  );
}

export function InputsPanel({
  text,
  workflow,
  primitives,
  pinned,
  ids,
  change,
}: {
  text: string;
  workflow: Workflow;
  primitives: Map<string, PrimitiveInfo>;
  pinned: Pinned;
  /** The inputs of the box selected; every input when none. */
  ids: string[] | null;
  change: Change;
}) {
  const shown = workflow.inputs.filter(
    (input) => ids === null || ids.includes(input.id),
  );
  return (
    <section className={classes.side} aria-label="Inputs">
      <SectionTitle order={3}>Inputs</SectionTitle>
      <ul className={classes.list}>
        {shown.map((input) => (
          <InputRow
            key={input.id}
            text={text}
            workflow={workflow}
            primitives={primitives}
            input={input}
            pinned={pinned}
            change={change}
          />
        ))}
      </ul>
      <AddDeclaration
        what="an input"
        taken={workflow.inputs.map((input) => input.id)}
        onAdd={(id, type) =>
          change(
            setInput(text, id, { type, options: type === 'enum' ? ['a', 'b'] : null }),
          )
        }
      />
    </section>
  );
}

export function FieldsPanel({
  text,
  workflow,
  primitives,
  pinned,
  names,
  change,
}: {
  text: string;
  workflow: Workflow;
  primitives: Map<string, PrimitiveInfo>;
  pinned: Pinned;
  names: string[] | null;
  change: Change;
}) {
  const shown = workflow.test.filter(
    (field) => names === null || names.includes(field.name),
  );
  return (
    <section className={classes.side} aria-label="Test fields">
      <SectionTitle order={3}>Test fields</SectionTitle>
      <BodyText size="sm" tone="secondary">
        What every test folder holds.
      </BodyText>
      <ul className={classes.list}>
        {shown.map((field) => (
          <FieldRow
            key={field.name}
            text={text}
            workflow={workflow}
            primitives={primitives}
            field={field}
            pinned={pinned}
            change={change}
          />
        ))}
      </ul>
      <AddDeclaration
        what="a test field"
        taken={workflow.test.map((field) => field.name)}
        onAdd={(name, type) =>
          change(
            setField(text, name, {
              type,
              options: type === 'enum' ? ['a', 'b'] : null,
            }),
          )
        }
      />
    </section>
  );
}

function EntryRow({
  text,
  workflow,
  primitives,
  entry,
  pinned,
  change,
}: {
  text: string;
  workflow: Workflow;
  primitives: Map<string, PrimitiveInfo>;
  entry: ReportEntry;
  pinned: Pinned;
  change: Change;
}) {
  const [refused, setRefused] = useState<string | null>(null);
  const from = entry.from;
  const step =
    from?.kind === 'steps'
      ? workflow.steps.find((found) => found.id === from.name)
      : undefined;
  const port =
    step !== undefined && from?.kind === 'steps'
      ? declared(primitives, step.use)?.outputs[from.output]
      : undefined;
  const isNumber = port?.type === 'number';
  const perTest = step?.perTest === true;
  const sources = reportable(workflow, primitives);
  const write = (
    next: Partial<{
      fold: string | null;
      better: string | null;
      at_least: NumberText | null;
      at_most: NumberText | null;
      from: typeof from;
    }>,
  ) => {
    const merged = {
      from: next.from !== undefined ? next.from : from,
      fold: 'fold' in next ? next.fold : entry.fold,
      better: 'better' in next ? next.better : entry.better,
      at_least: 'at_least' in next ? next.at_least : entry.atLeast,
      at_most: 'at_most' in next ? next.at_most : entry.atMost,
    };
    if (merged.from === null || merged.from === undefined) return;
    change(setEntry(text, entry.name, { ...merged, from: merged.from }));
  };
  const betterInputs = workflow.inputs.filter(
    (input) =>
      !input.contestant &&
      !input.optional &&
      input.type === 'enum' &&
      (input.options ?? []).every(
        (option) => option === 'higher' || option === 'lower',
      ),
  );
  const bound = (
    key: 'at_least' | 'at_most',
    label: string,
    current: NumberText | null,
  ) => (
    <CommitField
      label={label}
      value={current === null ? '' : current.text}
      apply={(written) => {
        if (written.trim() === '') {
          write({ [key]: null });
          return null;
        }
        const value = numberText(written);
        if (!(value instanceof NumberText)) return 'A number.';
        const least = key === 'at_least' ? value : entry.atLeast;
        const most = key === 'at_most' ? value : entry.atMost;
        if (least !== null && most !== null && least.value > most.value)
          return 'Must be at least at_least.';
        write({ [key]: value });
        return null;
      }}
    />
  );
  return (
    <li className={classes.primitive} aria-label={`The report entry ${entry.name}`}>
      <CommitField
        label="Name"
        value={entry.name}
        apply={(name) => {
          if (!REPORT_NAME.test(name))
            return 'Lower case letters, digits and _, starting with a letter.';
          if (RESERVED.includes(name))
            return `${name} is the platform’s own name for what a board ranks.`;
          if (
            workflow.report.some(
              (other) => other.name === name && other.name !== entry.name,
            )
          )
            return 'That is taken.';
          change(renameEntry(text, entry.name, name));
          return null;
        }}
      />
      <Select
        label="Reads"
        value={from !== null ? refLabel(from) : ''}
        placeholder="Nothing yet"
        error={refused ?? undefined}
        options={sources.map((ref) => ({ value: refLabel(ref), label: refLabel(ref) }))}
        onChange={(chosen) => {
          const ref = sources.find((found) => refLabel(found) === chosen);
          if (ref === undefined) return;
          const refused = reportRefusal(workflow, primitives, ref, entry);
          setRefused(refused);
          if (refused === null) write({ from: ref });
        }}
      />
      {isNumber && perTest && (
        <Select
          label="Folds over tests by"
          value={entry.fold ?? ''}
          placeholder="Not folded: shown per test"
          options={['sum', 'mean', 'max'].map((fold) => ({ value: fold, label: fold }))}
          onChange={(fold) => write({ fold: fold === '' ? null : fold })}
        />
      )}
      {isNumber && perTest && (
        <Select
          label="Better is"
          value={entry.better ?? ''}
          placeholder="Not ranked"
          options={[
            { value: 'higher', label: 'higher' },
            { value: 'lower', label: 'lower' },
            ...betterInputs.map((input) => ({
              value: refText({ kind: 'inputs', name: input.id }),
              label: `as the task's ${input.id} says`,
            })),
          ]}
          onChange={(better) => write({ better: better === '' ? null : better })}
        />
      )}
      {isNumber && bound('at_least', 'At least', entry.atLeast)}
      {isNumber && bound('at_most', 'At most', entry.atMost)}
      {(pinned.entries.get(entry.name) ?? []).map((problem) => (
        <p key={problem.message} className={classes.problemText}>
          {problem.message}
        </p>
      ))}
      <div>
        <Button
          size="xs"
          variant="secondary"
          onClick={() => change(removeEntry(text, entry.name))}
        >
          Remove the entry {entry.name}
        </Button>
      </div>
    </li>
  );
}

export function ReportPanel({
  text,
  workflow,
  primitives,
  pinned,
  change,
}: {
  text: string;
  workflow: Workflow;
  primitives: Map<string, PrimitiveInfo>;
  pinned: Pinned;
  change: Change;
}) {
  const sources = reportable(workflow, primitives);
  const [chosen, setChosen] = useState('');
  return (
    <section className={classes.side} aria-label="Report">
      <SectionTitle order={3}>Report</SectionTitle>
      <ul className={classes.list}>
        {workflow.report.map((entry) => (
          <EntryRow
            key={entry.name}
            text={text}
            workflow={workflow}
            primitives={primitives}
            entry={entry}
            pinned={pinned}
            change={change}
          />
        ))}
      </ul>
      {sources.length > 0 && (
        <div className={classes.item}>
          <Select
            label="Report an output"
            value={chosen}
            placeholder="Choose an output"
            options={sources.map((ref) => ({
              value: refLabel(ref),
              label: refLabel(ref),
            }))}
            onChange={setChosen}
          />
          <Button
            size="xs"
            disabled={chosen === ''}
            onClick={() => {
              const ref = sources.find((found) => refLabel(found) === chosen);
              if (ref === undefined) return;
              const name = freeName(
                ref.output,
                workflow.report.map((entry) => entry.name),
                '_',
              );
              change(setEntry(text, name, { from: ref }));
              setChosen('');
            }}
          >
            Add the entry
          </Button>
        </div>
      )}
    </section>
  );
}

export function Palette({
  primitives,
  onAdd,
}: {
  primitives: PrimitiveInfo[];
  onAdd: (primitive: PrimitiveInfo, perTest: boolean) => void;
}) {
  const usable = primitives.filter((primitive) => primitive.problem === null);
  return (
    <section className={classes.palette} aria-label="Palette">
      <SectionTitle order={3}>Primitives</SectionTitle>
      {usable.length === 0 && (
        <BodyText size="sm">The platform has no primitive this page can use.</BodyText>
      )}
      {usable.map((primitive) => {
        const raising = raisingPorts(primitive);
        return (
          <div
            key={primitive.ref}
            className={classes.primitive}
            aria-label={primitive.ref}
          >
            <BodyText size="sm">
              <strong>{primitive.ref}</strong>
              {primitive.batch ? ' · takes a batch' : ''}
              {primitive.network ? ' · network' : ''}
            </BodyText>
            <ul className={classes.ports} aria-label={`The ports of ${primitive.ref}`}>
              {Object.entries(primitive.inputs).map(([name, port]) => (
                <li key={`in ${name}`}>
                  in {name}: {port.type}
                  {port.optional ? ', optional' : ''}
                  {port.runs ? ', runs' : ''}
                  {port.secret ? ', secret' : ''}
                  {raising.has(name) ? ', raises a limit' : ''}
                  {port.options ? ` (${port.options.join(', ')})` : ''}
                </li>
              ))}
              {Object.entries(primitive.outputs).map(([name, port]) => (
                <li key={`out ${name}`}>
                  out {name}: {port.type}
                  {port.optional ? ', optional' : ''}
                </li>
              ))}
            </ul>
            <div className={classes.item}>
              <Button
                size="xs"
                onClick={() => onAdd(primitive, false)}
                label={`Add ${primitive.ref}, run once`}
              >
                Add, run once
              </Button>
              <Button
                size="xs"
                variant="secondary"
                onClick={() => onAdd(primitive, true)}
                label={`Add ${primitive.ref}, run per test`}
              >
                Add, run per test
              </Button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
