import { useEffect, useRef, type ReactNode } from 'react';
import type { ApiError } from '@/api/problem';
import type { SaveResult, WriteFile } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { t } from '@/lib/t';
import { DefinitionErrors } from '../DefinitionErrors';
import classes from '../organise.module.css';
import { definitionErrorsOf, stringsOf } from './refusals';

/**
 * What a save came back with: a contest file's new version, a task save that
 * published or was kept as a draft, or a refusal, which carries the body that
 * was sent so a confirmation can send the same save again.
 */
export type Outcome =
  | { kind: 'written'; version: string }
  | { kind: 'saved'; result: SaveResult }
  | { kind: 'refused'; error: ApiError; body: WriteFile };

const ACTIVATION: Record<'done' | 'pending' | 'not_needed', string> = {
  done: 'This save switched grading on for the task.',
  pending: 'Switching grading on for the task is under way.',
  not_needed: 'Grading was already on for the task.',
};

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

export function SaveOutcome({
  outcome,
  onConfirm,
  onKeepAsDraft,
  onReload,
}: {
  outcome: Outcome;
  onConfirm: (body: WriteFile) => void;
  onKeepAsDraft: (body: WriteFile) => void;
  onReload: () => void;
}) {
  if (outcome.kind === 'written') {
    return (
      <Panel role="status">
        <BodyText>
          {t('Saved as version')} <code>{short(outcome.version)}</code>.
        </BodyText>
      </Panel>
    );
  }

  if (outcome.kind === 'saved') {
    const { result } = outcome;
    if (result.outcome === 'published') {
      return (
        <Panel role="status">
          <BodyText>
            {t('Published as publication')} {result.number}.
          </BodyText>
          {result.grading_changed ? (
            <>
              <BodyText>{t('It changes how the task grades:')}</BodyText>
              <ul className={classes.named} aria-label={t('What changed')}>
                {result.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </>
          ) : (
            <BodyText>{t('It does not change how the task grades.')}</BodyText>
          )}
          <BodyText tone="secondary">{t(ACTIVATION[result.activation])}</BodyText>
        </Panel>
      );
    }
    return (
      <Panel role="status">
        <BodyText>
          {t(
            'Saved as a draft. Nothing was published; the last publication keeps grading.',
          )}
        </BodyText>
        {result.errors.length > 0 && (
          <>
            <BodyText>{t('What keeps it from publishing:')}</BodyText>
            <DefinitionErrors errors={result.errors} />
          </>
        )}
        {result.held_back.length > 0 && (
          <>
            <BodyText>{t('Held back from grading until it is confirmed:')}</BodyText>
            <ul className={classes.named} aria-label={t('Held back')}>
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
        <BodyText>{t('Someone else changed this file since you opened it.')}</BodyText>
        <BodyText tone="secondary">
          {t(
            'Nothing was saved, and your text is still here. Reloading shows their version and replaces your text, so copy anything you want to keep first.',
          )}
        </BodyText>
        <div className={classes.actions}>
          <Button size="xs" variant="secondary" onClick={onReload}>
            {t('Reload the file')}
          </Button>
        </div>
      </Panel>
    );
  }

  if (error.code === 'confirmation_required') {
    return (
      <Panel role="alert">
        <ErrorBlock error={error} compact />
        <BodyText>{t('What would change:')}</BodyText>
        <ul className={classes.named} aria-label={t('What would change')}>
          {stringsOf(error, 'changes').map((change) => (
            <li key={change}>{change}</li>
          ))}
        </ul>
        <BodyText tone="secondary">
          {t(
            'Publishing changes the grading of a running contest. Keeping it as a draft writes the files and publishes nothing.',
          )}
        </BodyText>
        <div className={classes.actions}>
          <Button size="xs" onClick={() => onConfirm(body)}>
            {t('Publish the change')}
          </Button>
          <Button size="xs" variant="secondary" onClick={() => onKeepAsDraft(body)}>
            {t('Keep as draft')}
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
        <ul className={classes.named} aria-label={t('What stands in the way')}>
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
