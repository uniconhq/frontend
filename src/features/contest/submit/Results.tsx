import type { GradingResult } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { VerdictBadge } from '@/ui/VerdictBadge';
import { cancelReason, valueText, verdictOf } from './grading';
import classes from './submit.module.css';

/**
 * A submission's verdict as one badge, or a line saying it has no grading. A
 * submission the organisers cancelled shows their sentence under the badge.
 */
export function Verdict({ grading }: { grading: GradingResult | null }) {
  if (grading === null) return <BodyText tone="secondary">Not graded</BodyText>;
  return (
    <>
      <VerdictBadge verdict={verdictOf(grading)} />
      {cancelReason(grading) !== null && (
        <BodyText tone="secondary">{cancelReason(grading)}</BodyText>
      )}
    </>
  );
}

/**
 * The values a run reported once, such as a compile log: each number in a
 * list of names and values, and each text as a block of its own, kept as the
 * run wrote it and never read as markup. Nothing when there are none.
 */
export function OnceValues({ values }: { values: Record<string, number | string> }) {
  const named = Object.entries(values);
  const numbers = named.filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number',
  );
  const texts = named.filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  return (
    <>
      {numbers.length > 0 && (
        <dl className={classes.metrics} aria-label="Values">
          {numbers.map(([name, value]) => (
            <div key={name} className={classes.metric}>
              <dt>{name}</dt>
              <dd>{valueText(value)}</dd>
            </div>
          ))}
        </dl>
      )}
      {texts
        .filter(([, text]) => text !== '')
        .map(([name, text]) => (
          <div key={name} className={classes.once}>
            <BodyText tone="secondary">{name}</BodyText>
            <pre className={classes.pre} aria-label={name} tabIndex={0}>
              {text}
            </pre>
          </div>
        ))}
    </>
  );
}
