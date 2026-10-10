import { useEffect, useRef, type ReactNode } from 'react';
import type { ApiError } from '@/api/problem';
import type { SaveResult, WriteFile } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { DefinitionErrors } from '../DefinitionErrors';
import classes from '../organise.module.css';
import { countOf, definitionErrorsOf, stringsOf } from './refusals';

/**
 * What a save came back with: a contest file's new version, a task save that
 * published or was kept as a draft, or a refusal, which carries the body that
 * was sent so a confirmation can send the same save again. The body is a
 * file's write unless the save was another kind, such as a rollback.
 */
export type Outcome<Body = WriteFile> =
  | { kind: 'written'; version: string }
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
 * What confirming a grading change costs, from the count the refusal
 * carries: how many submissions are graded again, or every one when a
 * backend sends no count.
 */
function regradedSentence(count: number | null): string {
  if (count === null)
    return 'every submission to the task is graded again against the new publication.';
  if (count === 0) return 'no submission to the task is graded again.';
  if (count === 1)
    return '1 submission to the task is graded again against the new publication.';
  return `${String(count)} submissions to the task are graded again against the new publication.`;
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

export function SaveOutcome<Body = WriteFile>({
  outcome,
  onConfirm,
  onKeepAsDraft,
  onReload,
}: {
  outcome: Outcome<Body>;
  onConfirm: (body: Body) => void;
  onKeepAsDraft: (body: Body) => void;
  onReload: () => void;
}) {
  if (outcome.kind === 'written') {
    return (
      <Panel role="status">
        <BodyText>
          Saved as version <code>{short(outcome.version)}</code>.
        </BodyText>
      </Panel>
    );
  }

  if (outcome.kind === 'saved') {
    const { result } = outcome;
    if ('number' in result) {
      return (
        <Panel role="status">
          <BodyText>Published as publication {result.number}.</BodyText>
          {result.grading_changed ? (
            <>
              <BodyText>It changes how the task grades:</BodyText>
              <ul className={classes.named} aria-label="What changed">
                {result.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </>
          ) : (
            <BodyText>It does not change how the task grades.</BodyText>
          )}
          {result.regraded > 0 && (
            <BodyText>
              {result.regraded === 1
                ? '1 submission is graded again.'
                : `${String(result.regraded)} submissions are graded again.`}
            </BodyText>
          )}
          {result.notes.length > 0 && (
            <>
              <BodyText>Of note:</BodyText>
              <ul className={classes.named} aria-label="Notes">
                {result.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      );
    }
    return (
      <Panel role="status">
        <BodyText>
          Saved as a draft. Nothing was published; the last publication keeps grading.
        </BodyText>
        {result.errors.length > 0 && (
          <>
            <BodyText>What keeps it from publishing:</BodyText>
            <DefinitionErrors errors={result.errors} />
          </>
        )}
        {result.held_back.length > 0 && (
          <>
            <BodyText>Held back from grading until it is confirmed:</BodyText>
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
          <Button size="xs" variant="secondary" onClick={onReload}>
            Reload the file
          </Button>
        </div>
      </Panel>
    );
  }

  if (error.code === 'confirmation_required') {
    return (
      <Panel role="alert">
        <ErrorBlock error={error} compact />
        <BodyText>What would change:</BodyText>
        <ul className={classes.named} aria-label="What would change">
          {stringsOf(error, 'changes').map((change) => (
            <li key={change}>{change}</li>
          ))}
        </ul>
        <BodyText tone="secondary">
          Publishing changes the grading of a running contest:{' '}
          {regradedSentence(countOf(error, 'regrades'))} Keeping it as a draft writes
          the files and publishes nothing.
        </BodyText>
        <div className={classes.actions}>
          <Button size="xs" onClick={() => onConfirm(body)}>
            Publish the change
          </Button>
          <Button size="xs" variant="secondary" onClick={() => onKeepAsDraft(body)}>
            Keep as draft
          </Button>
        </div>
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
        <DefinitionErrors errors={definitionErrorsOf(error)} />
      )}
    </Panel>
  );
}
