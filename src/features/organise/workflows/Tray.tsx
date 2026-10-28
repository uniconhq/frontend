import { useState, type ReactNode } from 'react';
import { BodyText } from '@/ui/BodyText';
import { TextInput } from '@/ui/TextInput';
import { formatUse, type BoxDecl, type PaletteWorkflow } from './boxes';
import { VALUE_TYPES, type ValueType } from './model';
import type { PrimitiveInfo } from './primitives';
import { versionNumber } from './versions';
import { needsWords, primitiveTitle, typeWords, visibilityWords } from './words';
import classes from './workflows.module.css';

/** What each type of input is for, as its tray button says under its name. */
const INPUT_LINES: Record<ValueType, string> = {
  text: 'A line of text, such as a language name',
  number: 'A number, such as a time limit in seconds',
  boolean: 'A switch, such as whether to lint',
  enum: 'One of a list, such as c, cpp or python',
  file: 'One file, such as a test’s input',
  folder: 'A folder of files, such as the entrant’s code',
};

/**
 * The newest usable version of each primitive, in the order the platform
 * lists them: an older version is chosen in the step's drawer.
 */
function newest(primitives: PrimitiveInfo[]): PrimitiveInfo[] {
  const found = new Map<string, PrimitiveInfo>();
  for (const primitive of primitives) {
    if (primitive.problem !== null) continue;
    const held = found.get(primitive.name);
    if (
      held === undefined ||
      (versionNumber(primitive.version) ?? 0) > (versionNumber(held.version) ?? 0)
    )
      found.set(primitive.name, primitive);
  }
  return [...found.values()];
}

function TrayGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={classes.tray} aria-label={title}>
      <h2 className={classes.trayTitle}>{title}</h2>
      {children}
    </section>
  );
}

/** A thing to add: named by `name`, with what it is under it and a note small. */
function TrayButton({
  name,
  label = name,
  line,
  note,
  onAdd,
}: {
  name: string;
  label?: string;
  line: string;
  note?: string;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      className={classes.trayItem}
      aria-label={label}
      title={line || undefined}
      onClick={onAdd}
    >
      <span className={classes.trayName}>{name}</span>
      {line !== '' && <span className={classes.trayLine}>{line}</span>}
      {note !== undefined && <span className={classes.trayNote}>{note}</span>}
    </button>
  );
}

/**
 * The tray over the graph at the top of a draft: an input of each type, the
 * newest version of each primitive, and each run workflow the author can
 * read at each version, found by owner or name. A click adds one, and the
 * editor opens it.
 */
export function Tray({
  primitives,
  workflows,
  finding,
  onInput,
  onPrimitive,
  onWorkflow,
}: {
  primitives: PrimitiveInfo[];
  /** Run workflows, never this one, each with its box. */
  workflows: (PaletteWorkflow & { box: BoxDecl })[];
  /** Whether the workflows are still being read, could not be, or are all here. */
  finding: 'reading' | 'failed' | 'done';
  onInput: (type: ValueType) => void;
  onPrimitive: (primitive: PrimitiveInfo) => void;
  onWorkflow: (workflow: PaletteWorkflow) => void;
}) {
  const [find, setFind] = useState('');
  const query = find.trim().toLowerCase();
  const found = workflows.filter(
    (workflow) =>
      query === '' ||
      `${workflow.owner}/${workflow.name}`.toLowerCase().includes(query),
  );
  const steps = newest(primitives);
  return (
    <section className={classes.trays} aria-label="Add to the workflow">
      <BodyText size="sm" tone="secondary">
        Click to add. The layout places it, and its drawer opens.
      </BodyText>
      <div className={classes.trayRow}>
        <TrayGroup title="Inputs">
          {VALUE_TYPES.map((type) => (
            <TrayButton
              key={type}
              name={typeWords(type)}
              line={INPUT_LINES[type]}
              onAdd={() => onInput(type)}
            />
          ))}
        </TrayGroup>
        <TrayGroup title="Primitives">
          {steps.length === 0 && (
            <BodyText size="sm" tone="secondary">
              Unicon has no primitive this page can use.
            </BodyText>
          )}
          {steps.map((primitive) => (
            <TrayButton
              key={primitive.ref}
              name={primitiveTitle(primitive)}
              line={primitive.description ?? ''}
              note={primitive.ref}
              onAdd={() => onPrimitive(primitive)}
            />
          ))}
        </TrayGroup>
        <TrayGroup title="Workflows">
          <TextInput label="Find a workflow" value={find} onChange={setFind} />
          {found.map((workflow) => {
            const ref = formatUse(workflow);
            return (
              <TrayButton
                key={ref}
                name={`${workflow.owner}/${workflow.name}`}
                label={ref}
                line={needsWords(
                  workflow.box.inputs.map((input) => input.name),
                  workflow.box.outputs.map((output) => output.name),
                )}
                note={`${visibilityWords(workflow)} · ${workflow.version}`}
                onAdd={() => onWorkflow(workflow)}
              />
            );
          })}
          {finding !== 'done' || found.length === 0 ? (
            <BodyText size="sm" tone="secondary">
              {finding === 'reading'
                ? 'Finding workflows…'
                : finding === 'failed'
                  ? 'The workflows could not be read.'
                  : workflows.length === 0
                    ? 'No other workflow you can read runs as a step.'
                    : 'No workflow matches.'}
            </BodyText>
          ) : null}
        </TrayGroup>
      </div>
    </section>
  );
}
