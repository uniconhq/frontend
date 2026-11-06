import { useState, type ReactNode } from 'react';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { WorkflowSearch } from './WorkflowSearch';
import {
  boxOptions,
  parseUse,
  formatUse,
  type BoxDecl,
  type PaletteWorkflow,
  type UseRef,
} from './boxes';
import { VALUE_TYPES, type ValueType } from './model';
import type { PrimitiveInfo } from './primitives';
import { versionNumber } from './versions';
import { needsWords, primitiveTitle, typeWords, visibilityWords } from './words';
import classes from './workflows.module.css';

const INPUT_LINES: Record<ValueType, string> = {
  text: 'A line of text, such as a language name',
  number: 'A number, such as a time limit in seconds',
  boolean: 'A switch, such as whether to lint',
  enum: 'One of a list, such as c, cpp or python',
  file: 'One file, such as a test’s input',
  folder: 'A folder of files, such as the entrant’s code',
};

/** The newest with no problem, in the platform's order. An older version is chosen in the step's drawer. */
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

export function Tray({
  primitives,
  workflows,
  exclude,
  finding,
  onInput,
  onPrimitive,
  onWorkflow,
}: {
  primitives: PrimitiveInfo[];
  exclude: string;
  /** Run workflows other than this one. */
  workflows: (PaletteWorkflow & { box: BoxDecl })[];
  finding: 'reading' | 'failed' | 'done';
  onInput: (type: ValueType) => void;
  onPrimitive: (primitive: PrimitiveInfo) => void;
  onWorkflow: (workflow: PaletteWorkflow) => void;
}) {
  const [searching, setSearching] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const queryClient = useQueryClient();
  // Closing the search or leaving the page forgets a choice still being read.
  const choice = useMutation({
    mutationFn: (use: UseRef) => queryClient.fetchQuery(boxOptions(use)),
  });
  const closeSearch = () => {
    choice.reset();
    setSearching(false);
  };
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
          <Button
            variant="secondary"
            onClick={() => {
              setRefusal(null);
              setSearching(true);
            }}
          >
            Find a workflow
          </Button>
          {refusal !== null && <BodyText>{refusal}</BodyText>}
          {searching && (
            <WorkflowSearch
              exclude={exclude}
              problem={refusal}
              choosing={choice.isPending}
              onClose={closeSearch}
              onChoose={(ref, item) => {
                const use = parseUse(ref);
                if (use === null || choice.isPending) return;
                choice.mutate(use, {
                  onSuccess: (box) => {
                    if (!box.run) {
                      setRefusal('Choose a run workflow to use as a step.');
                      return;
                    }
                    onWorkflow({ ...use, visibility: item.visibility });
                    setSearching(false);
                    setRefusal(null);
                  },
                  onError: () =>
                    setRefusal('This workflow could not be read. Try again.'),
                });
              }}
            />
          )}
          {workflows.map((workflow) => {
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
          {finding !== 'done' || workflows.length === 0 ? (
            <BodyText size="sm" tone="secondary">
              {finding === 'reading'
                ? 'Finding workflows…'
                : finding === 'failed'
                  ? 'The workflows could not be read.'
                  : 'No other workflow you can read runs as a step.'}
            </BodyText>
          ) : null}
        </TrayGroup>
      </div>
    </section>
  );
}
