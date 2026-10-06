import type { GradingResult } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { VerdictBadge } from '@/ui/VerdictBadge';
import { metricValue, verdictOf } from './grading';
import classes from './submit.module.css';

/**
 * A submission's verdict at each stage: one badge when the task grades at one
 * stage, and each after its stage's name when it grades at more.
 */
export function Verdicts({ gradings }: { gradings: GradingResult[] }) {
  if (gradings.length === 0) {
    return <BodyText tone="secondary">Not graded on submit</BodyText>;
  }
  const named = gradings.length > 1;
  return (
    <div className={classes.verdicts}>
      {gradings.map((grading) => (
        <span key={grading.id} className={classes.verdict}>
          {named && <span className={classes.stage}>{grading.stage}</span>}
          <VerdictBadge verdict={verdictOf(grading)} />
        </span>
      ))}
    </div>
  );
}

/**
 * The named numbers a verdict carries, as a list of names and values, or
 * nothing when the task shows none. `stage` names the stage they are of, when
 * the task grades at more than one.
 */
export function Metrics({
  metrics,
  stage,
}: {
  metrics: Record<string, number> | null;
  stage?: string;
}) {
  const named = Object.entries(metrics ?? {});
  if (named.length === 0) return null;
  return (
    <dl
      className={classes.metrics}
      aria-label={stage === undefined ? 'Metrics' : `Metrics ${stage}`}
    >
      {named.map(([name, value]) => (
        <div key={name} className={classes.metric}>
          <dt>{name}</dt>
          <dd>{metricValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
