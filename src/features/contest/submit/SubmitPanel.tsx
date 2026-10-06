import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import type { ApiError } from '@/api/problem';
import type { ContestantInput } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { FileDrop } from '@/ui/FileDrop';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { Textarea } from '@/ui/Textarea';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { formatLimit } from '@/lib/size';
import { entryOf, htmlAccept, type Draft, type Entry, type PanelInput } from './draft';
import type { Phase } from './use-submit';
import shared from '../contest.module.css';
import classes from './submit.module.css';

/**
 * What the panel says about itself: the submission just made.
 */
export type Notice = { kind: 'submitted'; number: number };

/**
 * A panel that takes the focus as it appears, so the answer to the person's
 * own click is what a keyboard or a screen reader lands on: `status` for an
 * answer, `alert` for a refusal.
 */
function Said({ role, children }: { role: 'status' | 'alert'; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.focus();
  }, []);
  return (
    <div ref={panel} className={shared.panel} role={role} tabIndex={-1}>
      {children}
    </div>
  );
}

type Problem = { input: string; message: string };

function problemsOf(error: ApiError): Problem[] {
  const value = error.extensions['errors'];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Problem =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Problem).input === 'string' &&
      typeof (item as Problem).message === 'string',
  );
}

/**
 * A refusal in words from its code, and what it names: each problem with the
 * input it is about, for `invalid_inputs`, and the input whose limit a file
 * broke, for `too_large`.
 */
function Refusal({ error, inputs }: { error: ApiError; inputs: ContestantInput[] }) {
  const labelOf = (id: string) => inputs.find((input) => input.id === id)?.label ?? id;
  const problems = error.code === 'invalid_inputs' ? problemsOf(error) : [];
  const input = error.extensions['input'];
  return (
    <Said role="alert">
      <ErrorBlock error={error} compact />
      {problems.length > 0 && (
        <ul className={classes.problems}>
          {problems.map((problem) => (
            <li key={`${problem.input}: ${problem.message}`}>
              {labelOf(problem.input)}: {problem.message}
            </li>
          ))}
        </ul>
      )}
      {error.code === 'too_large' && typeof input === 'string' && (
        <BodyText tone="secondary">The input: {labelOf(input)}</BodyText>
      )}
    </Said>
  );
}

/** The helper line under a file input: what it takes and how large. */
function fileHint(input: PanelInput, taskMaxSize: number): string {
  const parts: string[] = [];
  if (input.type === 'code' && input.language?.length === 1) {
    parts.push(`In ${input.language[0] ?? ''}.`);
  }
  if (input.accept !== null && input.type !== 'code') {
    parts.push(`Takes ${input.accept.join(', ')}.`);
  }
  const limit = Math.min(input.max_size ?? taskMaxSize, taskMaxSize);
  parts.push(`At most ${formatLimit(limit)}.`);
  return parts.join(' ');
}

function numberHint(input: PanelInput): string | undefined {
  if (input.min !== null && input.max !== null) {
    return `From ${input.min} to ${input.max}.`;
  }
  if (input.min !== null) return `At least ${input.min}.`;
  if (input.max !== null) return `At most ${input.max}.`;
  return undefined;
}

/** One input's field: a drop zone, with a language to choose for code, or a value. */
function Field({
  input,
  entry,
  onChange,
  taskMaxSize,
  busy,
  sentOf,
}: {
  input: PanelInput;
  entry: Entry;
  onChange: (entry: Entry) => void;
  taskMaxSize: number;
  busy: boolean;
  sentOf: (file: File) => number | null;
}) {
  const label = input.label ?? input.id;
  switch (entry.kind) {
    case 'files': {
      const languages = input.type === 'code' ? (input.language ?? []) : [];
      return (
        <div className={shared.stack}>
          <FileDrop
            label={label}
            description={fileHint(input, taskMaxSize)}
            accept={htmlAccept(input)}
            multiple={input.type === 'file[]'}
            files={entry.files}
            onChange={(files) => onChange({ ...entry, files })}
            progressOf={sentOf}
            disabled={busy}
          />
          {languages.length > 1 && (
            <div className={classes.narrow}>
              <Select
                label={`Language of ${label}`}
                value={entry.language}
                options={languages.map((language) => ({
                  value: language,
                  label: language,
                }))}
                placeholder="Choose a language"
                onChange={(language) => onChange({ ...entry, language })}
                required
                disabled={busy}
              />
            </div>
          )}
        </div>
      );
    }
    case 'flag':
      return (
        <Checkbox
          label={label}
          checked={entry.checked}
          onChange={(checked) => onChange({ kind: 'flag', checked })}
          disabled={busy}
        />
      );
    case 'text':
      return input.type === 'number' ? (
        <div className={classes.narrow}>
          <TextInput
            label={label}
            description={numberHint(input)}
            value={entry.text}
            onChange={(text) => onChange({ kind: 'text', text })}
            inputMode="decimal"
            disabled={busy}
          />
        </div>
      ) : (
        <Textarea
          label={label}
          value={entry.text}
          onChange={(text) => onChange({ kind: 'text', text })}
          readOnly={busy}
          rows={3}
        />
      );
  }
}

const PHASE: Record<Exclude<Phase, 'idle'>, string> = {
  hashing: 'Reading your files.',
  uploading: 'Sending your files.',
  submitting: 'Submitting.',
};

/**
 * The form a contestant submits from: one field per input the task takes
 * from them, in the task's order, and Submit. `draft` is what is in it,
 * owned by the page, which empties it once a submit has gone through.
 * `notice` is what it says about the last thing it did; `refusal` is why the
 * last submit was turned away.
 */
export function SubmitPanel({
  inputs,
  notebook,
  taskMaxSize,
  draft,
  onDraftChange,
  onSubmit,
  phase,
  sentOf,
  refusal,
  notice,
}: {
  inputs: PanelInput[];
  /** Whether the task also takes a notebook, which is not sent from here. */
  notebook: boolean;
  taskMaxSize: number;
  draft: Draft;
  onDraftChange: (draft: Draft) => void;
  onSubmit: () => void;
  phase: Phase;
  sentOf: (file: File) => number | null;
  refusal: ApiError | null;
  notice: Notice | null;
}) {
  const busy = phase !== 'idle';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  if (inputs.length === 0) {
    return (
      <BodyText tone="secondary">
        {notebook
          ? 'This task takes a notebook, which is not submitted from this page.'
          : 'This task takes nothing to submit from this page.'}
      </BodyText>
    );
  }

  return (
    <form className={shared.stack} aria-label="Submit" onSubmit={submit} noValidate>
      {notebook && (
        <BodyText tone="secondary">
          This task also takes a notebook, which is not submitted from this page.
        </BodyText>
      )}
      {inputs.map((input) => (
        <Field
          key={input.id}
          input={input}
          entry={entryOf(draft, input)}
          onChange={(entry) => onDraftChange({ ...draft, [input.id]: entry })}
          taskMaxSize={taskMaxSize}
          busy={busy}
          sentOf={sentOf}
        />
      ))}
      <div>
        <Button type="submit" loading={busy}>
          Submit
        </Button>
      </div>
      <div role="status" aria-label="Sending">
        {busy && <BodyText tone="secondary">{PHASE[phase]}</BodyText>}
      </div>
      {refusal !== null && !busy && <Refusal error={refusal} inputs={inputs} />}
      {refusal === null && !busy && notice?.kind === 'submitted' && (
        <Said key={`submitted ${notice.number}`} role="status">
          <BodyText>Submitted as #{notice.number}.</BodyText>
          <BodyText tone="secondary">
            It is in your submissions below, and graded there.
          </BodyText>
        </Said>
      )}
    </form>
  );
}
