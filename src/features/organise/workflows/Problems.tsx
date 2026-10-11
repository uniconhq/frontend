import { BodyText } from '@/ui/BodyText';
import type { Selected } from './lines';
import type { Placed } from './pins';
import classes from './workflows.module.css';

/**
 * The banner above the graph (M31): what stops the draft from becoming a
 * version, every problem with its message and where it is, each a link that
 * opens its box; or that nothing does; or that the check did not run, which
 * is not the same as passing. A draft saves with problems all the same.
 */
export function Problems({
  status,
  failure,
  placed,
  checking = false,
  onOpen,
}: {
  status: 'pending' | 'failed' | 'done';
  /** The answer shown is the last one, while the latest change is checked. */
  checking?: boolean;
  /** Why the check did not run, when it did not. */
  failure: string | null;
  placed: Placed[];
  onOpen: (selected: Selected) => void;
}) {
  if (status === 'pending') return null;
  const waiting = checking && (
    <BodyText size="sm" tone="secondary">
      Checking the latest change…
    </BodyText>
  );
  if (status === 'failed')
    return (
      <section className={classes.banner} aria-label="Problems" data-tone="warn">
        <BodyText size="sm">
          The check did not run, so this page cannot say whether the draft can be
          published as a version: {failure}
        </BodyText>
        {waiting}
      </section>
    );
  if (placed.length === 0)
    return (
      <section className={classes.banner} aria-label="Problems" data-tone="ok">
        <BodyText size="sm" tone="secondary">
          Nothing to fix: this draft can be published as a version.
        </BodyText>
        {waiting}
      </section>
    );
  const one = placed.length === 1;
  return (
    <section className={classes.banner} aria-label="Problems" data-tone="problem">
      <BodyText size="sm">
        {one ? 'One problem' : `${String(placed.length)} problems`} to fix before
        publishing a version. You can still save the draft with {one ? 'it' : 'them'}.
      </BodyText>
      <ul className={classes.problemList}>
        {placed.map(({ problem, where, opens }) => (
          <li key={`${problem.path} ${problem.message}`}>
            {opens === null ? (
              <strong>{where}</strong>
            ) : (
              <button
                type="button"
                className={classes.problemLink}
                onClick={() => onOpen(opens)}
              >
                {where}
              </button>
            )}
            : {problem.message}
          </li>
        ))}
      </ul>
      {waiting}
    </section>
  );
}
