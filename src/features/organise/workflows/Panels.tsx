import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ActionMenu } from '@/ui/ActionMenu';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { FileDrop } from '@/ui/FileDrop';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { NumberText, numberText } from '../forms/yaml-doc';
import {
  clearPort,
  entryFields,
  fileToInput,
  freeName,
  idOfPath,
  inputToFile,
  moveFile,
  sharedNames,
  removeEntry,
  removeInput,
  removeStep,
  renameEntry,
  renameInput,
  renameStep,
  setEntry,
  setInput,
  setUse,
  setValue,
  wire,
  type EntryFields,
  type InputFields,
  workflowOf,
} from './edit';
import { formatUse, parseUse, type BoxDecl } from './boxes';
import { BoxFiles, UploadProgress } from './Files';
import { useStagedUpload, type Staging } from './staged-upload';
import {
  VALUE_TYPES,
  refLabel,
  refProblem,
  refsIn,
  refsOf,
  sameRef,
  wholeRef,
  refText,
  type Ref,
  type InputDecl,
  type OutputEntry,
  type Workflow,
} from './model';
import type { Pinned } from './pins';
import { declared, type PrimitiveInfo } from './primitives';
import {
  mayBeOptional,
  newProblem,
  stepInputs,
  stepOutputs,
  outputType,
  outputSources,
  outputRefusal,
  valueRefusal,
  wireRefusal,
} from './rules';
import {
  fileType,
  limitsWords,
  needsWords,
  outcomeWords,
  portMarks,
  primitiveTitle,
  refWords,
  typeWords,
} from './words';
import classes from './workflows.module.css';

/**
 * What the drawer holds for the box selected (M37): a step, with how often
 * it runs, its name, its primitive's version, a value for each port without
 * a wire and what each port is for (#436), what the author never acts on
 * under Details; the inputs, each offering exactly what the format allows it
 * and what the task's form names it (#434); and the outputs, each with what
 * pages call it and its unit. Every change is an edit of the file
 * in place, handed up as its new text.
 */

type Change = (next: string) => void;

const HANDLE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const OUTPUT_NAME = /^[a-z][a-z0-9_]*$/;
/**
 * Names Unicon uses itself, as the forge refuses them: what it gives every
 * run, its verdict and `passed`, and the older names it still keeps.
 */
const RESERVED = ['verdict', 'passed', 'outcome', 'points', 'penalty'];
const SCALARS = ['text', 'number', 'boolean', 'enum'];
/** A port's choice of a value written in the drawer, which no reference is written as. */
const FIXED = 'fixed';

/** Why `name` cannot be an id among `taken`, or null when it can. */
/** Whether the panels change the file, or show a version, which nothing changes. */
const Editing = createContext(true);

/** What only changes the file, such as Remove, left out of a version's panel. */
function EditOnly({ children }: { children: ReactNode }) {
  return useContext(Editing) ? children : null;
}

/**
 * A panel as a version's page shows it: what the editor's drawer shows,
 * every field locked, and what only changes the file left out.
 */
export function LockedPanel({ children }: { children: ReactNode }) {
  return (
    <Editing.Provider value={false}>
      <fieldset disabled className={classes.locked}>
        {children}
      </fieldset>
    </Editing.Provider>
  );
}

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

/** What one of a step's ports takes, from its primitive or the workflow it runs. */
type PortShape = {
  name: string;
  type: string;
  options: string[] | null;
  optional: boolean;
  line: string | undefined;
};

/** A value written for a port that takes a plain value: text, a number, true or false, or one of a list. */
function PortValue({
  text,
  workflow,
  primitives,
  boxes,
  index,
  shape,
  change,
}: {
  text: string;
  workflow: Workflow;
  primitives: Map<string, PrimitiveInfo>;
  boxes: ReadonlyMap<string, BoxDecl>;
  index: number;
  shape: PortShape;
  change: Change;
}) {
  const port = shape.name;
  const value = workflow.steps[index]?.with[port];
  const label = `Value of ${port}`;
  const current =
    value === undefined
      ? ''
      : value.kind === 'literal'
        ? value.value instanceof NumberText
          ? value.value.text
          : String(value.value)
        : value.kind === 'text'
          ? value.text
          : value.kind === 'invalid'
            ? JSON.stringify(value.raw)
            : '';
  const apply = (raw: string | NumberText | boolean | undefined): string | null => {
    if (raw === undefined || raw === '') {
      change(clearPort(text, index, port));
      return null;
    }
    const whole = typeof raw === 'string' ? wholeRef(raw) : null;
    if (whole !== null) {
      const refused = wireRefusal(workflow, primitives, index, port, whole, boxes);
      if (refused !== null) return refused;
      change(wire(text, index, port, whole));
      return null;
    }
    const bad = typeof raw === 'string' ? refProblem(raw) : null;
    if (bad !== null) return bad;
    const written = (typeof raw === 'string' ? refsIn(raw) : []) ?? [];
    const refused = valueRefusal(
      workflow,
      primitives,
      index,
      port,
      raw,
      written,
      boxes,
    );
    if (refused !== null) return refused;
    change(setValue(text, index, port, raw));
    return null;
  };
  if (shape.type === 'boolean')
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
  if (shape.type === 'enum')
    return (
      <Select
        label={label}
        value={current}
        placeholder="No value"
        options={(shape.options ?? []).map((option) => ({
          value: option,
          label: option,
        }))}
        onChange={(chosen) => apply(chosen === '' ? undefined : chosen)}
      />
    );
  const insertable = [
    ...workflow.inputs
      .filter((input) => SCALARS.includes(input.type) && !input.optional)
      .map((input) => ({ kind: 'inputs' as const, name: input.id })),
  ];
  return (
    <>
      <CommitField
        label={label}
        value={current}
        description={
          shape.type === 'text' && insertable.length > 0
            ? 'Write in an input’s value with “Write in a value”.'
            : undefined
        }
        apply={(typedText) => apply(typed(typedText, shape.type))}
      />
      {shape.type === 'text' && insertable.length > 0 && (
        <EditOnly>
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
        </EditOnly>
      )}
    </>
  );
}

/**
 * One of a step's ports: one choice of where its value comes from, offering
 * only the sources that fit, and for a port that takes a plain value, a fixed
 * value, whose field shows once it is chosen. A value the drawer cannot edit, several values as a mapping of
 * files or a value written on a file port, is said here and can be cleared;
 * its parts are changed in the file.
 */
function PortRow({
  text,
  workflow,
  primitives,
  boxes,
  index,
  shape,
  fitting,
  change,
}: {
  text: string;
  workflow: Workflow;
  primitives: Map<string, PrimitiveInfo>;
  boxes: ReadonlyMap<string, BoxDecl>;
  index: number;
  shape: PortShape;
  /** The sources the port may be wired from. */
  fitting: Ref[];
  change: Change;
}) {
  const [writing, setWriting] = useState(false);
  const port = shape.name;
  const value = workflow.steps[index]?.with[port];
  const label = `${port}${shape.optional ? ' (optional)' : ''}`;
  const plain = SCALARS.includes(shape.type);
  const fixed =
    value?.kind === 'mapping' || value?.kind === 'list'
      ? (() => {
          const read = refsOf(value).map(refWords);
          return `takes several values${read.length > 0 ? `: ${read.join(', ')}` : ''}.`;
        })()
      : value !== undefined && value.kind !== 'wire' && !plain
        ? `is given ${
            value.kind === 'literal'
              ? value.value instanceof NumberText
                ? value.value.text
                : String(value.value)
              : value.kind === 'text'
                ? value.text
                : JSON.stringify(value.raw)
          }, which is not a ${shape.type}.`
        : null;
  if (fixed !== null) {
    return (
      <div className={classes.portValue}>
        <BodyText size="sm">
          <strong>{label}</strong> {fixed}
        </BodyText>
        {shape.line !== undefined && (
          <BodyText size="sm" tone="secondary">
            {shape.line}
          </BodyText>
        )}
        <EditOnly>
          <div>
            <Button
              size="xs"
              variant="secondary"
              onClick={() => change(clearPort(text, index, port))}
            >
              Clear {port}
            </Button>
          </div>
        </EditOnly>
      </div>
    );
  }
  const wired = value?.kind === 'wire' ? value.ref : null;
  // A wire the rules now refuse is still shown, so the Select says what it is.
  const offered =
    wired === null || fitting.some((ref) => sameRef(ref, wired))
      ? fitting
      : [...fitting, wired];
  const valued = plain && wired === null && (value !== undefined || writing);
  return (
    <div className={classes.stack}>
      <Select
        label={label}
        value={wired !== null ? refText(wired) : valued ? FIXED : ''}
        placeholder="Nothing yet"
        description={shape.line}
        options={[
          ...(plain ? [{ value: FIXED, label: 'A fixed value' }] : []),
          ...offered.map((ref) => ({ value: refText(ref), label: refWords(ref) })),
        ]}
        onChange={(chosen) => {
          setWriting(chosen === FIXED);
          const ref = offered.find((found) => refText(found) === chosen);
          if (ref !== undefined) change(wire(text, index, port, ref));
          else if (value !== undefined && (chosen !== FIXED || wired !== null))
            change(clearPort(text, index, port));
        }}
      />
      {valued && (
        <PortValue
          text={text}
          workflow={workflow}
          primitives={primitives}
          boxes={boxes}
          index={index}
          shape={shape}
          change={change}
        />
      )}
    </div>
  );
}

/**
 * What the author never acts on, said once in plain words for whoever wants
 * it: the primitive, how it runs many runs, the verdicts it gives, what it
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
            When a grading has many runs of it, one start serves them all rather than
            one start each, and each run keeps its own limits.
          </li>
        )}
        {primitive.network && <li>It can reach the network.</li>}
        {typeof outcome === 'string' && <li>Verdict it gives: {outcome}</li>}
        {Array.isArray(outcome) && (
          <li>
            Verdict it gives, one of:
            <ul className={classes.detailList} aria-label="Verdicts it gives">
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

/**
 * A step in the order the drawer shows it: its name; what it runs; that a
 * newer version of the workflow it runs is out, and Open to see inside;
 * where each port is wired from; what it gives; then its version, Details
 * and Remove.
 */
export function StepPanel({
  text,
  workflow,
  primitives,
  boxes,
  reading,
  pinned,
  index,
  fitting,
  change,
  onRemoved,
  onZoom,
}: {
  text: string;
  workflow: Workflow;
  primitives: Map<string, PrimitiveInfo>;
  /** The run workflows' boxes, by the reference a step uses. */
  boxes: ReadonlyMap<string, BoxDecl>;
  /** Whether a workflow's box is still being read. */
  reading: boolean;
  pinned: Pinned;
  index: number;
  /** The sources the port `port` may be wired from, as the graph's wires are checked. */
  fitting: (port: string) => Ref[];
  change: Change;
  onRemoved: () => void;
  /** Shows the inside of the workflow the step runs. */
  onZoom: () => void;
}) {
  const [versionRefused, setVersionRefused] = useState<string | null>(null);
  const step = workflow.steps[index];
  if (step === undefined) return null;
  const primitive = declared(primitives, step);
  const use = primitive === null ? parseUse(step.use) : null;
  const box = primitive === null ? boxes.get(step.use) : undefined;
  const newer = box?.newer ?? null;
  const versions = [...primitives.values()].filter(
    (found) =>
      found.problem === null && primitive !== null && found.name === primitive.name,
  );
  const shapes: PortShape[] = (stepInputs(primitives, boxes, step) ?? []).map(
    (input) => ({
      ...input,
      line: primitive === null ? undefined : portLine(primitive, input.name),
    }),
  );
  const outputs = stepOutputs(primitives, boxes, step)
    .filter((output) => output.type !== 'outcome')
    .map((output) => ({
      ...output,
      description: primitive?.outputs[output.name]?.description ?? null,
    }));
  const newerRef =
    use === null || newer === null ? null : formatUse({ ...use, version: newer });
  const problems = [
    ...(pinned.steps.get(index) ?? []),
    ...[
      ...new Set([...Object.keys(step.with), ...shapes.map((shape) => shape.name)]),
    ].flatMap((port) => pinned.ports.get(`${String(index)}.${port}`) ?? []),
  ];
  /** Writes `written`, unless it breaks a wire the old version kept. */
  const moveTo = (written: string) => {
    const broken = newProblem(workflow, workflowOf(written), primitives, boxes);
    setVersionRefused(broken);
    if (broken === null) change(written);
  };
  return (
    <section className={classes.panel} aria-label={`The step ${step.id}`}>
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
      ) : use !== null && box !== undefined ? (
        <div className={classes.stack}>
          <BodyText size="sm">
            <strong>
              {use.owner}/{use.name}
            </strong>{' '}
            <span className={classes.ref}>{step.use}</span>
          </BodyText>
          <BodyText size="sm" tone="secondary">
            A workflow run as one step
            {shapes.length + outputs.length > 0
              ? `: it ${needsWords(
                  shapes.map((shape) => shape.name),
                  outputs.map((output) => output.name),
                )}.`
              : '.'}
          </BodyText>
          {box.description !== null && (
            <BodyText size="sm" tone="secondary">
              <span className={classes.said}>{box.description}</span>
            </BodyText>
          )}
        </div>
      ) : use !== null && reading ? (
        <BodyText size="sm" tone="secondary">
          Reading {step.use}…
        </BodyText>
      ) : use !== null ? (
        <BodyText size="sm">
          Unicon cannot run {step.use} as a step: it is not a workflow you can read, or
          it is a test workflow, which is not run as a box. Choose another, or remove
          the step.
        </BodyText>
      ) : (
        <BodyText size="sm">
          {step.use} is not a primitive or a workflow Unicon has now. Choose another
          version, or remove the step.
        </BodyText>
      )}
      {problems.length > 0 && (
        <ul className={classes.problems} aria-label="Problems with this step">
          {problems.map((problem) => (
            <li key={`${problem.path} ${problem.message}`}>{problem.message}</li>
          ))}
        </ul>
      )}
      {newer !== null && newerRef !== null && (
        <div className={classes.stack}>
          <BodyText size="sm">{newer} is out.</BodyText>
          <EditOnly>
            <div>
              <Button
                size="xs"
                variant="secondary"
                // Its box is needed to check that every wire and value still fits.
                disabled={!boxes.has(newerRef)}
                onClick={() => moveTo(setUse(text, index, newerRef))}
              >
                Move to it
              </Button>
            </div>
          </EditOnly>
          {!boxes.has(newerRef) && (
            <BodyText size="sm" tone="secondary">
              {reading
                ? `Reading ${newer}…`
                : `${newer} could not be read, so the step cannot move to it yet.`}
            </BodyText>
          )}
          {versionRefused !== null && (
            <p className={classes.problemText} role="alert">
              {versionRefused}
            </p>
          )}
        </div>
      )}
      {box !== undefined && (
        <EditOnly>
          <div>
            <Button
              size="xs"
              variant="secondary"
              onClick={onZoom}
              label={`Open ${step.id}`}
            >
              Open
            </Button>
          </div>
        </EditOnly>
      )}
      {shapes.length > 0 && (
        <>
          <Part>What it takes</Part>
          {shapes.map((shape) => (
            <PortRow
              key={shape.name}
              text={text}
              workflow={workflow}
              primitives={primitives}
              boxes={boxes}
              index={index}
              shape={shape}
              fitting={fitting(shape.name)}
              change={change}
            />
          ))}
        </>
      )}
      {outputs.length > 0 && (
        <>
          <Part>What it gives</Part>
          <ul className={classes.outputs} aria-label="What it gives">
            {outputs.map((output) => (
              <li key={output.name}>
                <strong>{output.name}</strong>{' '}
                <span className={classes.ref}>{output.type}</span>
                {output.description !== null && (
                  <BodyText size="sm" tone="secondary">
                    {output.description}
                  </BodyText>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {versions.length > 1 && primitive !== null && (
        <Select
          label="Version"
          value={step.use}
          options={versions.map((found) => ({
            value: found.ref,
            label: found.version,
          }))}
          error={versionRefused ?? undefined}
          onChange={(chosen) => moveTo(setUse(text, index, chosen))}
        />
      )}
      {primitive !== null && (
        <Details primitive={primitive} step={step} workflow={workflow} />
      )}
      <EditOnly>
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
      </EditOnly>
    </section>
  );
}

const TYPE_OPTIONS = VALUE_TYPES.map((type) => ({
  value: type,
  label: typeWords(type),
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
  boxes,
  input,
  pinned,
  files,
  staging,
  change,
  onRenamed,
  onGiven,
}: {
  text: string;
  workflow: Workflow;
  primitives: Map<string, PrimitiveInfo>;
  boxes: ReadonlyMap<string, BoxDecl>;
  input: InputDecl;
  pinned: Pinned;
  files: Ref[];
  staging: Staging;
  change: Change;
  onRenamed: (id: string) => void;
  onGiven: (path: string) => void;
}) {
  const [refused, setRefused] = useState<string | null>(null);
  const [giving, setGiving] = useState(false);
  const isFile = input.type === 'file' || input.type === 'folder';
  const fields: InputFields = {
    type: input.type,
    options: input.options,
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
    const written = setInput(text, input.id, merged);
    const broken = newProblem(workflow, workflowOf(written), primitives, boxes);
    setRefused(broken);
    if (broken === null) change(written);
  };
  const problems = pinned.inputs.get(input.id) ?? [];
  const readers = workflow.steps.flatMap((step) =>
    Object.entries(step.with)
      .filter(([, value]) =>
        refsOf(value).some((ref) => ref.kind === 'inputs' && ref.name === input.id),
      )
      .map(([port]) => `${step.id}.${port}`),
  );
  return (
    <li className={classes.declaration} aria-label={`The input ${input.id}`}>
      <CommitField
        label="Name"
        value={input.id}
        description="Steps read it by this name. Renaming it changes them too."
        apply={(id) => {
          const problem = handleProblem(
            id,
            sharedNames(workflow).filter((other) => other !== input.id),
          );
          if (problem === null) {
            change(renameInput(text, input.id, id));
            onRenamed(id);
          }
          return problem;
        }}
      />
      {isFile && (
        <Select
          label="Comes from"
          value={giving ? 'workflow' : 'task'}
          options={[
            { value: 'task', label: 'The task, on every run' },
            readers.length === 0
              ? {
                  value: 'workflow',
                  label: `A ${input.type} of this workflow, once a step reads it`,
                  disabled: true,
                }
              : { value: 'workflow', label: `A ${input.type} of this workflow` },
          ]}
          onChange={(chosen) => setGiving(chosen === 'workflow')}
        />
      )}
      {isFile && giving && (
        <GiveFromWorkflow
          id={input.id}
          type={input.type === 'folder' ? 'folder' : 'file'}
          files={files}
          staging={staging}
          onFile={(path) => {
            const written = inputToFile(text, input.id, path);
            const broken = newProblem(workflow, workflowOf(written), primitives, boxes);
            setRefused(broken);
            if (broken !== null) return;
            change(written);
            onGiven(path);
          }}
        />
      )}
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
      <Part>Read by</Part>
      <BodyText size="sm">
        {readers.length === 0 ? 'Nothing yet' : readers.join(', ')}
      </BodyText>
      <EditOnly>
        <div>
          <Button
            size="xs"
            variant="danger"
            onClick={() => change(removeInput(text, input.id))}
          >
            Remove the input {input.id}
          </Button>
        </div>
      </EditOnly>
    </li>
  );
}

/**
 * The file of the workflow an input becomes: one already among its files, or
 * a file uploaded here, which waits for Save as the Files drawer's do.
 */
function GiveFromWorkflow({
  id,
  type,
  files,
  staging,
  onFile,
}: {
  id: string;
  type: 'file' | 'folder';
  files: Ref[];
  staging: Staging;
  onFile: (path: string) => void;
}) {
  const { upload, state, error, busy } = useStagedUpload(staging);
  const [taken, setTaken] = useState<string | null>(null);
  // An upload ends later: it becomes the file of the draft as it is then,
  // and of nothing once this choice is gone, its file staged all the same.
  const latest = useRef<((path: string) => void) | null>(onFile);
  useEffect(() => {
    latest.current = onFile;
  });
  useEffect(
    () => () => {
      latest.current = null;
    },
    [],
  );
  const locked = staging.disabled || busy;
  const fitting = files.filter((ref) => fileType(ref.name) === type);
  return (
    <div className={classes.stack}>
      <BodyText size="sm" tone="secondary">
        Tasks no longer give it. Every step that reads {id} reads this {type} instead,
        saved with the workflow and the same on every run.
      </BodyText>
      <Select
        label={`The ${type}`}
        value=""
        placeholder={fitting.length === 0 ? `No ${type} yet` : `Choose a ${type}`}
        options={fitting.map((ref) => ({ value: ref.name, label: ref.name }))}
        disabled={locked}
        onChange={(path) => {
          if (path !== '') onFile(path);
        }}
      />
      {type === 'file' ? (
        <>
          <FileDrop
            label="Or upload one"
            files={[]}
            disabled={locked}
            onChange={(chosen) => {
              const [file] = chosen;
              // A file of the same name is replaced only in its own drawer, or in Files.
              const same = files.some((ref) => ref.name === file?.name);
              setTaken(same && file !== undefined ? file.name : null);
              if (same) return;
              void upload(chosen, (each) => each.name).then((sent) => {
                const [path] = sent ?? [];
                if (path !== undefined) latest.current?.(path);
              });
            }}
          />
          {taken !== null && (
            <p className={classes.problemText} role="alert">
              The workflow already has a file {taken}. Choose it above, or replace it in
              Files.
            </p>
          )}
          <UploadProgress state={state} error={error} />
        </>
      ) : (
        <BodyText size="sm" tone="secondary">
          Upload a folder in Files, then choose it here.
        </BodyText>
      )}
    </div>
  );
}

/**
 * The drawer of a file of the workflow a step reads: which file it is, which
 * steps read it, and a way to have the task give it instead, as an input.
 */
export function FilePanel({
  text,
  workflow,
  primitives,
  boxes,
  path,
  files,
  listed,
  staging,
  change,
  onMoved,
  onSupplied,
}: {
  text: string;
  workflow: Workflow;
  primitives: Map<string, PrimitiveInfo>;
  boxes: ReadonlyMap<string, BoxDecl>;
  /** The file or folder of the box selected. */
  path: string;
  /** The workflow's files and folders, saved and staged. */
  files: Ref[];
  /** Whether the saved files are read yet, so `files` holds every one. */
  listed: boolean;
  staging: Staging;
  change: Change;
  /** The steps read the file at `path` now, which the drawer follows. */
  onMoved: (path: string) => void;
  /** The file is the input `id` now, which the drawer follows. */
  onSupplied: (id: string) => void;
}) {
  const [refused, setRefused] = useState<string | null>(null);
  /** `written` as the draft, unless it newly breaks a wire, which is said instead. */
  const apply = (written: string): boolean => {
    const broken = newProblem(workflow, workflowOf(written), primitives, boxes);
    setRefused(broken);
    if (broken === null) change(written);
    return broken === null;
  };
  const type = fileType(path);
  const fitting = files.filter((ref) => fileType(ref.name) === type);
  const known = fitting.some((ref) => ref.name === path);
  const readers = workflow.steps.flatMap((step) =>
    Object.entries(step.with)
      .filter(([, value]) =>
        refsOf(value).some((ref) => ref.kind === 'workflow' && ref.name === path),
      )
      .map(([port]) => `${step.id}.${port}`),
  );
  return (
    <section className={classes.panel} aria-label="The workflow file">
      <BodyText size="sm" tone="secondary">
        A {type} of this workflow: saved with it and with every version it publishes,
        and the same on every run. The task does not give it.
      </BodyText>
      <Select
        label={`The ${type}`}
        value={path}
        options={[
          ...(known ? [] : [{ value: path, label: path }]),
          ...fitting.map((ref) => ({ value: ref.name, label: ref.name })),
        ]}
        onChange={(to) => {
          if (to !== path && apply(moveFile(text, path, to))) onMoved(to);
        }}
      />
      {listed && !known && (
        <p className={classes.problemText}>
          {path} is not among this workflow’s files yet. Upload it below, or choose
          another.
        </p>
      )}
      {refused !== null && (
        <p className={classes.problemText} role="alert">
          {refused}
        </p>
      )}
      <Part>Read by</Part>
      <BodyText size="sm">
        {readers.length === 0 ? 'Nothing yet' : readers.join(', ')}
      </BodyText>
      <EditOnly>
        <BoxFiles key={path} path={path} staging={staging} />
        <div>
          <Button
            size="xs"
            variant="secondary"
            onClick={() => {
              const id = freeName(
                idOfPath(path),
                [...sharedNames(workflow), ...RESERVED],
                '_',
              );
              if (apply(fileToInput(text, path, id, type))) onSupplied(id);
            }}
          >
            Let the task supply it instead
          </Button>
        </div>
      </EditOnly>
    </section>
  );
}

export function InputsPanel({
  text,
  workflow,
  primitives,
  boxes,
  pinned,
  id,
  files,
  staging,
  change,
  onRenamed,
  onGiven,
}: {
  text: string;
  workflow: Workflow;
  primitives: Map<string, PrimitiveInfo>;
  boxes: ReadonlyMap<string, BoxDecl>;
  pinned: Pinned;
  /** The input of the box selected. */
  id: string;
  /** The workflow's files and folders, saved and staged. */
  files: Ref[];
  staging: Staging;
  change: Change;
  /** The input was renamed `id`, which the drawer follows. */
  onRenamed: (id: string) => void;
  /** The input is the workflow's file at `path` now, which the drawer follows. */
  onGiven: (path: string) => void;
}) {
  const shown = workflow.inputs.filter((input) => input.id === id);
  return (
    <section className={classes.panel} aria-label="The inputs">
      <BodyText size="sm" tone="secondary">
        An input: what a task gives this workflow for each run, such as a time limit, or
        what each entrant gives, such as their program. The task’s form names it by its
        title.
      </BodyText>
      <ul className={classes.list}>
        {shown.map((input) => (
          <InputRow
            key={input.id}
            text={text}
            workflow={workflow}
            primitives={primitives}
            boxes={boxes}
            input={input}
            pinned={pinned}
            files={files}
            staging={staging}
            change={change}
            onRenamed={onRenamed}
            onGiven={onGiven}
          />
        ))}
      </ul>
    </section>
  );
}

function EntryRow({
  text,
  workflow,
  primitives,
  boxes,
  entry,
  pinned,
  change,
}: {
  text: string;
  workflow: Workflow;
  primitives: Map<string, PrimitiveInfo>;
  boxes: ReadonlyMap<string, BoxDecl>;
  entry: OutputEntry;
  pinned: Pinned;
  change: Change;
}) {
  const [refused, setRefused] = useState<string | null>(null);
  const from = entry.from;
  const type = outputType(workflow, primitives, from, boxes);
  const isNumber = type === 'number';
  // What the file reads is still shown when it is not offered, so From says what it is.
  const sources = outputSources(workflow, primitives, boxes);
  const offered =
    from === null || from.kind !== 'steps' || sources.some((ref) => sameRef(ref, from))
      ? sources
      : [...sources, from];
  const write = (next: Partial<EntryFields>) => {
    const reads = next.from ?? from;
    if (reads === null) return;
    change(
      setEntry(
        text,
        entry.name,
        entryFields(entry, outputType(workflow, primitives, reads, boxes), {
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
        description="A task reads it by this name, as a column of its runs."
        apply={(name) => {
          if (!OUTPUT_NAME.test(name))
            return "An output's name may use only lower case letters, digits and underscores (_), starting with a letter.";
          if (RESERVED.includes(name))
            return `${name} is a name Unicon uses itself, for what it gives every run. Give this output another name.`;
          if (name !== entry.name && sharedNames(workflow).includes(name))
            return 'Another one already has that name. Choose another.';
          change(renameEntry(text, entry.name, name));
          return null;
        }}
      />
      <Select
        label="From"
        value={from !== null ? refLabel(from) : ''}
        placeholder="Nothing yet"
        error={refused ?? undefined}
        options={offered.map((ref) => ({ value: refLabel(ref), label: refWords(ref) }))}
        onChange={(chosen) => {
          const ref = offered.find((found) => refLabel(found) === chosen);
          if (ref === undefined) return;
          const refused = outputRefusal(workflow, primitives, ref, boxes);
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
      <EditOnly>
        <div>
          <Button
            size="xs"
            variant="danger"
            onClick={() => change(removeEntry(text, entry.name))}
          >
            Remove {entry.name} from the outputs
          </Button>
        </div>
      </EditOnly>
    </li>
  );
}

export function OutputsPanel({
  text,
  workflow,
  primitives,
  boxes,
  pinned,
  change,
}: {
  text: string;
  workflow: Workflow;
  primitives: Map<string, PrimitiveInfo>;
  boxes: ReadonlyMap<string, BoxDecl>;
  pinned: Pinned;
  change: Change;
}) {
  const sources = outputSources(workflow, primitives, boxes);
  const [chosen, setChosen] = useState('');
  return (
    <section className={classes.panel} aria-label="Outputs">
      <BodyText size="sm" tone="secondary">
        What each run gives, such as the time a program took. A task reads each as a
        column of its runs, and a workflow that uses this one as a box wires them on.
      </BodyText>
      <ul className={classes.list}>
        {workflow.outputs.map((entry) => (
          <EntryRow
            key={entry.name}
            text={text}
            workflow={workflow}
            primitives={primitives}
            boxes={boxes}
            entry={entry}
            pinned={pinned}
            change={change}
          />
        ))}
      </ul>
      {sources.length > 0 && (
        <EditOnly>
          <div className={classes.add}>
            <Select
              label="A step’s output to add"
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
                  const name = freeName(ref.output, sharedNames(workflow), '_');
                  change(setEntry(text, name, { from: ref }));
                  setChosen('');
                }}
              >
                Add an output
              </Button>
            </div>
          </div>
        </EditOnly>
      )}
    </section>
  );
}
