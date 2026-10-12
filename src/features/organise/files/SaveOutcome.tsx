import { useEffect, useRef, type ReactNode } from 'react';
import type { ApiError } from '@/api/problem';
import { describeError } from '@/api/describe-error';
import type { SaveEffect, SaveResult, WriteFile } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { DefinitionErrors, type PlaceOf } from '../DefinitionErrors';
import classes from '../organise.module.css';
import { definitionErrorsOf, effectOf, stringsOf } from './refusals';

/**
 * What a save came back with: a contest file's new version with what its
 * boards report, a task save that published or was kept as a draft, or a
 * refusal, which carries the body that
 * was sent so a confirmation can send the same save again. The body is a
 * file's write unless the save was another kind, such as a rollback.
 */
export type Outcome<Body = WriteFile> =
  | { kind: 'written'; version: string; notes: string[] }
  | { kind: 'saved'; result: SaveResult }
  | { kind: 'refused'; error: ApiError; body: Body };

/** The member each refusal names what stands in the way with. */
const NAMED_BY: Partial<Record<string, string>> = {
  admin_only: 'keys',
  reserved_path: 'paths',
  invalid_path: 'path',
};

/** A version is a commit; its first seven characters are how git shows one. */
function short(version: string): string {
  return version.slice(0, 7);
}

/**
 * The panel an outcome is shown in. It takes the focus as it appears, since
 * the Save button that had it went busy, so the answer is what a keyboard or a
 * screen reader lands on: `status` for an answer, `alert` for a refusal.
 */
function Panel({ role, children }: { role: 'status' | 'alert'; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.focus();
  }, []);
  return (
    <div ref={panel} className={classes.panel} role={role} tabIndex={-1}>
      {children}
    </div>
  );
}

/**
 * What a save reports beside what it did, under a label that says what they
 * are: `label`, such as "About the leaderboards:".
 */
function Notes({ label, notes }: { label: string; notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <>
      <BodyText>{label}</BodyText>
      <ul className={classes.named} aria-label={label.replace(/:$/, '')}>
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </>
  );
}

/** The parts of what a save does, each under its label, in this order (#449). */
const PARTS = [
  ['runs_again', 'Runs again'],
  ['scores', 'Scores'],
  ['reading', 'What entrants read'],
] as const;

/**
 * What a save does, in the same words before it, as the question a running
 * contest asks, and after it, as its answer (#449, M66): whether anyone's
 * result changes, then what runs again, the scores and what entrants read,
 * each part a line or more.
 */
function Effect({ effect }: { effect: SaveEffect }) {
  return (
    <>
      <BodyText>
        <strong>{effect.summary}</strong>
      </BodyText>
      {PARTS.map(([part, label]) =>
        effect[part].length === 0 ? null : (
          <div key={part} className={classes.effectPart}>
            <BodyText>{label}</BodyText>
            <ul className={classes.named} aria-label={label}>
              {effect[part].map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ),
      )}
    </>
  );
}

/**
 * What a save came back with, in words. `placeOf`, when given, names each
 * problem a refused save lists by the part of the page and the field it is
 * about, with a link that opens it; `bare` says a written save in words
 * alone, for a form whose versions the organiser never sees.
 */
export function SaveOutcome<Body = WriteFile>({
  outcome,
  onConfirm,
  onKeepAsDraft,
  onReload,
  placeOf,
  bare = false,
}: {
  outcome: Outcome<Body>;
  onConfirm: (body: Body) => void;
  onKeepAsDraft: (body: Body) => void;
  onReload: () => void;
  placeOf?: PlaceOf;
  bare?: boolean;
}) {
  if (outcome.kind === 'written') {
    return (
      <Panel role="status">
        {bare ? (
          <BodyText>Saved.</BodyText>
        ) : (
          <BodyText>
            Saved as version <code>{short(outcome.version)}</code>.
          </BodyText>
        )}
        <Notes label="About the leaderboards:" notes={outcome.notes} />
      </Panel>
    );
  }

  if (outcome.kind === 'saved') {
    const { result } = outcome;
    if ('number' in result) {
      return (
        <Panel role="status">
          <BodyText>Saved and published as publication {result.number}.</BodyText>
          <Effect effect={result.effect} />
          <Notes label="About the task as published:" notes={result.notes} />
        </Panel>
      );
    }
    return (
      <Panel role="status">
        <BodyText>
          Saved as a draft. Nothing was published, so entrants are still graded on the
          last publication.
        </BodyText>
        {result.errors.length > 0 && (
          <>
            <BodyText>What stops it from publishing:</BodyText>
            <DefinitionErrors errors={result.errors} placeOf={placeOf} />
          </>
        )}
        {result.held_back.length > 0 && (
          <>
            <BodyText>What waits in the draft until it is published:</BodyText>
            <ul className={classes.named} aria-label="Held back">
              {result.held_back.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          </>
        )}
      </Panel>
    );
  }

  const { error, body } = outcome;

  if (error.code === 'conflict') {
    return (
      <Panel role="alert">
        <BodyText>Someone else changed this file since you opened it.</BodyText>
        <BodyText tone="secondary">
          Nothing was saved, and your text is still here. Reloading shows their version
          and replaces your text, so copy anything you want to keep first.
        </BodyText>
        <div className={classes.actions}>
          <Button variant="secondary" onClick={onReload}>
            Reload the file
          </Button>
        </div>
      </Panel>
    );
  }

  if (error.code === 'confirmation_required') {
    const effect = effectOf(error);
    return (
      <Panel role="alert">
        {effect === null ? (
          // A backend that does not say what the save does yet names what changed.
          <>
            <ErrorBlock error={error} compact />
            <ul className={classes.named} aria-label="What would change">
              {stringsOf(error, 'changes').map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <Effect effect={effect} />
            <BodyText>
              <strong>{describeError(error).title}</strong>
            </BodyText>
          </>
        )}
        <div className={classes.actions}>
          <Button onClick={() => onConfirm(body)}>Publish the change</Button>
          <Button variant="secondary" onClick={() => onKeepAsDraft(body)}>
            Keep as draft
          </Button>
        </div>
        <BodyText tone="secondary">
          A draft keeps the change without publishing it: entrants see no difference
          until it is published.
        </BodyText>
      </Panel>
    );
  }

  const member = NAMED_BY[error.code];
  const named = member === undefined ? [] : stringsOf(error, member);

  return (
    <Panel role="alert">
      <ErrorBlock error={error} compact />
      {named.length > 0 && (
        <ul className={classes.named} aria-label="What stands in the way">
          {named.map((item) => (
            <li key={item} className={classes.mono}>
              {item}
            </li>
          ))}
        </ul>
      )}
      {error.code === 'invalid_definition' && (
        <DefinitionErrors errors={definitionErrorsOf(error)} placeOf={placeOf} />
      )}
    </Panel>
  );
}
