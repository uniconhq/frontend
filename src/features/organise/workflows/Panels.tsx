import { useState } from 'react';
import { ActionMenu } from '@/ui/ActionMenu';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { NumberText, numberText } from '../forms/yaml-doc';
import {
  clearPort,
  entryFields,
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
  setUse,
  setValue,
  wire,
  type EntryFields,
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
import { declared, type PrimitiveInfo } from './primitives';
import {
  mayBeOptional,
  newProblem,
  outputType,
  reportable,
  reportRefusal,
  valueRefusal,
  wireRefusal,
} from './rules';
import {
  limitsWords,
  outcomeWords,
  portMarks,
  primitiveTitle,
  refWords,
} from './words';
import classes from './workflows.module.css';

/**
 * What the drawer holds for the box selected (M37): a step, with how often
 * it runs, its name, its primitive's version, a value for each port without
 * a wire and what each port is for (#436), what the author never acts on
 * under Details; the inputs, each offering exactly what the format allows it
 * and what the task's form names it (#434); a test's files; and the report's
 * entries with what each number means. Every change is an edit of the file
 * in place, handed up as its new text.
 */

type Change = (next: string) => void;

const HANDLE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const REPORT_NAME = /^[a-z][a-z0-9_]*$/;
const RESERVED = ['outcome', 'points', 'penalty'];
const SCALARS = ['text', 'number', 'boolean', 'enum'];
const NOT_TEST = 'A test field cannot be called test. Choose another name.';

/** Why `name` cannot be an id among `taken`, or null when it can. */
function handleProblem(name: string, taken: string[]): string | null {
  if (!HANDLE.test(name))
    return 'Use at most 40 lower case letters, digits, hyphens (-) and underscores (_), starting with a letter or a digit.';
  if (taken.includes(name)) return 'Another one already has that name. Choose another.';
  return null;
}

/** A field that applies its text when it is left or Enter is pressed, refusing with a reason. */
function CommitField({
  label,
  value,
  apply,
  description,
  placeholder,
}: {
  label: string;
  value: string;
  /** Applies the text, or says why it cannot. */
  apply: (text: string) => string | null;
  description?: string;
  placeholder?: string;
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
      placeholder={placeholder}
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

/** A small heading inside the drawer, over a part of what it holds. */
function Part({ children }: { children: string }) {
  return <h3 className={classes.part}>{children}</h3>;
}

/** What a port is for: the primitive's sentence (#436), then what it does, in words. */
function portLine(primitive: PrimitiveInfo, port: string): string | undefined {
  const description = primitive.inputs[port]?.description ?? null;
  const marks = portMarks(primitive, port).map(
    (mark) => `${mark.charAt(0).toUpperCase()}${mark.slice(1)}.`,
  );
  const line = [description, ...marks].filter((part) => part !== null).join(' ');
  return line === '' ? undefined : line;
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
  if (step === undefined || primitive === null || decl === undefined) return null;
  const label = `${port}${decl.optional ? ' (optional)' : ''}`;
  const line = portLine(primitive, port);
  if (value?.kind === 'wire')
    return (
      <div className={classes.portValue}>
        <BodyText size="sm">
          <strong>{label}</strong> takes {refWords(value.ref)}.
        </BodyText>
        {line !== undefined && (
          <BodyText size="sm" tone="secondary">
            {line}
          </BodyText>
        )}
        <div>
          <Button
            size="xs"
            variant="secondary"
            onClick={() => change(clearPort(text, index, port))}
          >
            Remove the wire to {port}
          </Button>
        </div>
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
          : value.kind === 'mapping' || value.kind === 'list'
            ? ''
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
        description={line}
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
        description={line}
        options={(decl.options ?? []).map((option) => ({
          value: option,
          label: option,
        }))}
        onChange={(chosen) => apply(chosen === '' ? undefined : chosen)}
      />
    );
  if (decl.type === 'file' || decl.type === 'folder')
    return (
      <div className={classes.portValue}>
        <BodyText size="sm">
          <strong>{label}</strong> takes a {decl.type}. Wire it from an input or another
          step’s output, with its port on the graph.
        </BodyText>
        {line !== undefined && (
          <BodyText size="sm" tone="secondary">
            {line}
          </BodyText>
        )}
      </div>
    );
  const insertable = [
    ...workflow.inputs
      .filter((input) => SCALARS.includes(input.type) && !input.optional)
      .map((input) => ({ kind: 'inputs' as const, name: input.id })),
  ];
  return (
    <div className={classes.stack}>
      <CommitField
        label={label}
        value={current}
        description={
          decl.type === 'text' && insertable.length > 0
            ? [line, 'Write in an input’s value with “Write in a value”.']
                .filter((part) => part !== undefined)
                .join(' ')
            : line
        }
        apply={(typedText) => apply(typed(typedText, decl.type))}
      />
      {decl.type === 'text' && insertable.length > 0 && (
        <ActionMenu
          button
          text="Write in a value"
          label={`Write a value into ${port}`}
          entries={insertable.map((ref) => ({
            kind: 'item' as const,
            text: refWords(ref),
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

/**
 * What the author never acts on, said once in plain words for whoever wants
 * it: the primitive, how it runs the tests, what result it reports, what it
 * keeps secret, and what it gets each time it runs and whose limits those
 * are (M56).
 */
function Details({
  primitive,
  step,
  workflow,
}: {
  primitive: PrimitiveInfo;
  step: Workflow['steps'][number];
  workflow: Workflow;
}) {
  const secret = Object.entries(primitive.inputs).filter(([, port]) => port.secret);
  const outcome = outcomeWords(primitive);
  const limits = limitsWords(primitive, step, workflow);
  return (
    <details className={classes.details}>
      <summary>Details</summary>
      <ul className={classes.detailList}>
        <li>
          Primitive <code>{primitive.ref}</code>
        </li>
        {primitive.batch && (
          <li>
            When it runs for each test, one start serves all the tests rather than one
            start each, and each test keeps its own limits.
          </li>
        )}
        {primitive.network && <li>It can reach the network.</li>}
        {typeof outcome === 'string' && <li>Result it reports: {outcome}</li>}
        {Array.isArray(outcome) && (
          <li>
            Result it reports, one of:
            <ul className={classes.detailList} aria-label="Results it reports">
              {outcome.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </li>
        )}
        {secret.map(([name]) => (
          <li key={name}>
            {name} is kept from the entrant’s program, so a task may give it a secret.
          </li>
        ))}
        {limits !== null && (
          <li>
            {limits.gets} {limits.whose}
          </li>
        )}
      </ul>
    </details>
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
  const problems = [
    ...(pinned.steps.get(index) ?? []),
    ...Object.keys(step.with).flatMap(
      (port) => pinned.ports.get(`${String(index)}.${port}`) ?? [],
    ),
    ...Object.keys(primitive?.inputs ?? {})
      .filter((port) => !(port in step.with))
      .flatMap((port) => pinned.ports.get(`${String(index)}.${port}`) ?? []),
  ];
  const outputs = Object.entries(primitive?.outputs ?? {}).filter(
    ([, port]) => port.type !== 'outcome',
  );
  return (
    <section className={classes.panel} aria-label={`The step ${step.id}`}>
      {primitive !== null ? (
        <div className={classes.stack}>
          <BodyText size="sm">
            <strong>{primitiveTitle(primitive)}</strong>{' '}
            <span className={classes.ref}>{primitive.ref}</span>
          </BodyText>
          {primitive.description !== null && (
            <BodyText size="sm" tone="secondary">
              {primitive.description}
            </BodyText>
          )}
        </div>
      ) : (
        <BodyText size="sm">
          {step.use} is not a primitive Unicon has now. Choose another version, or
          remove the step.
        </BodyText>
      )}
      {problems.length > 0 && (
        <ul className={classes.problems} aria-label="Problems with this step">
          {problems.map((problem) => (
            <li key={`${problem.path} ${problem.message}`}>{problem.message}</li>
          ))}
        </ul>
      )}
      <CommitField
        label="Name"
        value={step.id}
        description="Other steps read its outputs by this name. Renaming it changes them too."
        apply={(id) => {
          const problem = handleProblem(
            id,
            workflow.steps.filter((_, at) => at !== index).map((other) => other.id),
          );
          if (problem === null) change(renameStep(text, index, id));
          return problem;
        }}
      />
      {versions.length > 1 && primitive !== null && (
        <Select
          label="Version"
          value={step.use}
          options={versions.map((found) => ({
            value: found.ref,
            label: found.version,
          }))}
          error={versionRefused ?? undefined}
          onChange={(use) => {
            const written = setUse(text, index, use);
            const broken = newProblem(workflow, workflowOf(written), primitives);
            setVersionRefused(broken);
            if (broken === null) change(written);
          }}
        />
      )}
      {primitive !== null && (
        <>
          <Part>What it takes</Part>
          {Object.keys(primitive.inputs).map((port) => (
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
          {outputs.length > 0 && (
            <>
              <Part>What it gives</Part>
              <ul className={classes.outputs} aria-label="What it gives">
                {outputs.map(([name, port]) => (
                  <li key={name}>
                    <strong>{name}</strong>{' '}
                    <span className={classes.ref}>{port.type}</span>
                    {port.description !== null && (
                      <BodyText size="sm" tone="secondary">
                        {port.description}
                      </BodyText>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          <Details primitive={primitive} step={step} workflow={workflow} />
        </>
      )}
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

const TYPE_WORDS: Record<string, string> = {
  text: 'Text',
  number: 'Number',
  boolean: 'True or false',
  enum: 'One of a list',
  file: 'File',
  folder: 'Folder',
};

const TYPE_OPTIONS = VALUE_TYPES.map((type) => ({
  value: type,
  label: TYPE_WORDS[type] ?? type,
}));

function optionsText(options: string[] | null): string {
  return (options ?? []).join(', ');
}

function optionsOf(text: string): string[] {
  return text
    .split(',')
    .map((option) => option.trim())
    .filter((option) => option !== '');
}

/** A line of text for the task's form: empty leaves it out of the file. */
function formText(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
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
    title: input.title,
    help: input.help,
    unit: input.unit,
  };
  const update = (next: Partial<InputFields>) => {
    const merged = { ...fields, ...next };
    if (merged.type !== 'enum') merged.options = null;
    else if (merged.options === null || merged.options?.length === 0)
      merged.options = ['a', 'b'];
    // A unit goes after a number's title on the task's form, and only there (M54).
    if (merged.type !== 'number') merged.unit = null;
    if (!(merged.contestant && merged.type === 'file')) merged.per_test = false;
    if (merged.contestant) merged.optional = false;
    const written = setInput(text, input.id, merged);
    const broken = newProblem(workflow, workflowOf(written), primitives);
    setRefused(broken);
    if (broken === null) change(written);
  };
  const problems = pinned.inputs.get(input.id) ?? [];
  return (
    <li className={classes.declaration} aria-label={`The input ${input.id}`}>
      <CommitField
        label="Name"
        value={input.id}
        description="Steps read it by this name. Renaming it changes them too."
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
      {input.type === 'enum' && (
        <CommitField
          label="Options"
          description="Separated by commas."
          value={optionsText(input.options)}
          apply={(written) => {
            const options = optionsOf(written);
            if (options.length === 0) return 'List the options to choose from.';
            if (new Set(options).size !== options.length)
              return 'List each option once.';
            update({ options });
            return null;
          }}
        />
      )}
      {(input.optional || mayBeOptional(workflow, primitives, input.id)) && (
        <Checkbox
          label="A task may leave it out"
          checked={input.optional}
          onChange={(optional) => update({ optional })}
        />
      )}
      <div className={classes.formText}>
        <CommitField
          label="Title on the task’s form"
          value={input.title ?? ''}
          placeholder={input.id}
          apply={(written) => {
            update({ title: formText(written) });
            return null;
          }}
        />
        {(input.type === 'number' || input.unit !== null) && (
          // Only a number takes one; another type shows one only to clear it.
          <CommitField
            label="Unit"
            value={input.unit ?? ''}
            placeholder="seconds"
            description={
              input.type === 'number'
                ? undefined
                : 'Only a number takes a unit, so clear this one.'
            }
            apply={(written) => {
              update({ unit: formText(written) });
              return null;
            }}
          />
        )}
      </div>
      <CommitField
        label="Help on the task’s form"
        value={input.help ?? ''}
        description="One sentence saying what it is for, shown beside its title."
        apply={(written) => {
          update({ help: formText(written) });
          return null;
        }}
      />
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
    <li className={classes.declaration} aria-label={`The test’s ${field.name}`}>
      <CommitField
        label="Name"
        value={field.name}
        description="Steps read it by this name. Renaming it changes them too."
        apply={(name) => {
          if (name === 'test') return NOT_TEST;
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
            if (options.length === 0) return 'List the options to choose from.';
            update({ options });
            return null;
          }}
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
          Remove {field.name} from each test
        </Button>
      </div>
    </li>
  );
}

/** A new input's or test's name and type, added in place. */
function AddDeclaration({
  label,
  button,
  taken,
  test = false,
  onAdd,
}: {
  label: string;
  button: string;
  taken: string[];
  test?: boolean;
  onAdd: (id: string, type: string) => void;
}) {
  const [id, setId] = useState('');
  const [type, setType] = useState('file');
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <form
      className={classes.add}
      aria-label={button}
      onSubmit={(event) => {
        event.preventDefault();
        const found =
          handleProblem(id, taken) ?? (test && id === 'test' ? NOT_TEST : null);
        setProblem(found);
        if (found !== null) return;
        onAdd(id, type);
        setId('');
      }}
    >
      <TextInput
        label={label}
        value={id}
        onChange={setId}
        error={problem ?? undefined}
      />
      <Select label="Of type" value={type} options={TYPE_OPTIONS} onChange={setType} />
      <div>
        <Button size="xs" type="submit">
          {button}
        </Button>
      </div>
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
    <section className={classes.panel} aria-label="The inputs">
      <BodyText size="sm" tone="secondary">
        What the workflow asks for: settings each task gives, such as a time limit, and
        what each entrant gives, such as their program. The task’s form names each by
        its title.
      </BodyText>
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
        label="New input"
        button="Add an input"
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
    <section className={classes.panel} aria-label="Each test’s files">
      <BodyText size="sm" tone="secondary">
        What every test holds, such as its input and its answer. Each task’s tests give
        these, and only a step that runs for each test reads them.
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
        label="New file or value"
        button="Add to each test"
        test
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
  const type = outputType(workflow, primitives, from);
  const isNumber = type === 'number';
  const sources = reportable(workflow, primitives);
  const write = (next: Partial<EntryFields>) => {
    const reads = next.from ?? from;
    if (reads === null) return;
    change(
      setEntry(
        text,
        entry.name,
        entryFields(entry, outputType(workflow, primitives, reads), {
          ...next,
          from: reads,
        }),
      ),
    );
  };
  return (
    <li className={classes.declaration} aria-label={`The output ${entry.name}`}>
      <CommitField
        label="Name"
        value={entry.name}
        description="Tasks and leaderboards pick it by this name."
        apply={(name) => {
          if (!REPORT_NAME.test(name))
            return "A reported value's name may use only lower case letters, digits and underscores (_), starting with a letter.";
          if (RESERVED.includes(name))
            return `${name} is a name Unicon uses itself, for what a leaderboard ranks. Report this value under another name.`;
          if (
            workflow.report.some(
              (other) => other.name === name && other.name !== entry.name,
            )
          )
            return 'Another one already has that name. Choose another.';
          change(renameEntry(text, entry.name, name));
          return null;
        }}
      />
      <Select
        label="Reads"
        value={from !== null ? refLabel(from) : ''}
        placeholder="Nothing yet"
        error={refused ?? undefined}
        options={sources.map((ref) => ({ value: refLabel(ref), label: refWords(ref) }))}
        onChange={(chosen) => {
          const ref = sources.find((found) => refLabel(found) === chosen);
          if (ref === undefined) return;
          const refused = reportRefusal(workflow, primitives, ref);
          setRefused(refused);
          if (refused === null) write({ from: ref });
        }}
      />
      <div className={classes.formText}>
        <CommitField
          label="Title"
          value={entry.title ?? ''}
          placeholder={entry.name}
          description="What pages call it, such as Run time. Without one, they use its name."
          apply={(written) => {
            write({ title: formText(written) });
            return null;
          }}
        />
        {(isNumber || entry.unit !== null) && (
          // Only a number takes one; text shows one only to clear it.
          <CommitField
            label="Unit"
            value={entry.unit ?? ''}
            placeholder="ms"
            description={
              type === null || isNumber
                ? undefined
                : 'Only a number takes a unit, so clear this one.'
            }
            apply={(written) => {
              write({ unit: formText(written) });
              return null;
            }}
          />
        )}
      </div>
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
          Remove {entry.name} from the outputs
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
    <section className={classes.panel} aria-label="Outputs">
      <BodyText size="sm" tone="secondary">
        What each grading reports, such as the time a program took. Organisers see it
        with every grading, and a leaderboard can rank by a number here.
      </BodyText>
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
        <div className={classes.add}>
          <Select
            label="Report an output"
            value={chosen}
            placeholder="Choose an output"
            options={sources.map((ref) => ({
              value: refLabel(ref),
              label: refWords(ref),
            }))}
            onChange={setChosen}
          />
          <div>
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
              Add an output
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
