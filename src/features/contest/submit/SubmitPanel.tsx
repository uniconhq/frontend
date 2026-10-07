import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import type { ApiError } from '@/api/problem';
import type { InputField } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { FileDrop } from '@/ui/FileDrop';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import { Textarea } from '@/ui/Textarea';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { formatLimit } from '@/lib/size';
import { entryOf, pathOf, takesPaths, type Draft, type Entry } from './draft';
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
function Refusal({ error, inputs }: { error: ApiError; inputs: InputField[] }) {
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

/**
 * The helper line under a file input: how its files are named, for one that
 * takes a file per test, and how large they may be together.
 */
function fileHint(input: InputField): string {
  const limit = formatLimit(input.max_size);
  if (input.per_test) {
    return `One file for each test, named for it as <group>/<test>, such as main/1.txt: choose a folder that holds a folder for each test group. At most ${limit} in all.`;
  }
  return input.type === 'folder' ? `At most ${limit} in all.` : `At most ${limit}.`;
}

function numberHint(input: InputField): string | undefined {
  if (input.min !== null && input.max !== null) {
    return `From ${input.min} to ${input.max}.`;
  }
  if (input.min !== null) return `At least ${input.min}.`;
  if (input.max !== null) return `At most ${input.max}.`;
  return undefined;
}

/**
 * One input's field: a drop zone, a choice, or a value. An enum with only
 * one option has nothing to choose, so it is a line saying which.
 */
function Field({
  input,
  entry,
  onChange,
  busy,
  sentOf,
}: {
  input: InputField;
  entry: Entry;
  onChange: (entry: Entry) => void;
  busy: boolean;
  sentOf: (file: File) => number | null;
}) {
  const { label } = input;
  switch (entry.kind) {
    case 'files':
      return (
        <FileDrop
          label={label}
          description={fileHint(input)}
          folder={takesPaths(input)}
          pathOf={(file) => pathOf(input, file)}
          files={entry.files}
          onChange={(files) => onChange({ kind: 'files', files })}
          progressOf={sentOf}
          disabled={busy}
        />
      );
    case 'choice': {
      const options = input.options ?? [];
      if (options.length === 1) {
        return (
          <BodyText>
            {label}: {options[0]}
          </BodyText>
        );
      }
      return (
        <div className={classes.narrow}>
          <Select
            label={label}
            value={entry.option}
            options={options.map((option) => ({ value: option, label: option }))}
            placeholder="Choose one"
            onChange={(option) => onChange({ kind: 'choice', option })}
            required
            disabled={busy}
          />
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
  draft,
  onDraftChange,
  onSubmit,
  phase,
  sentOf,
  refusal,
  notice,
}: {
  inputs: InputField[];
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
        This task takes nothing to submit from this page.
      </BodyText>
    );
  }

  return (
    <form className={shared.stack} aria-label="Submit" onSubmit={submit} noValidate>
      {inputs.map((input) => (
        <Field
          key={input.id}
          input={input}
          entry={entryOf(draft, input)}
          onChange={(entry) => onDraftChange({ ...draft, [input.id]: entry })}
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
