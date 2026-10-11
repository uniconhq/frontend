import type { GroupShown, Reported, ScoredGrading } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { VerdictBadge } from '@/ui/VerdictBadge';
import { formatExact } from '@/lib/exact';
import { formatDateTime } from '@/lib/time';
import { pointsText, valueText } from './scored-text';
import classes from './scored.module.css';

/**
 * The values a run reported once, such as a compile log: each number in a
 * list of names and values, and each text as a block of its own, kept as the
 * run wrote it and never read as markup. Nothing when there are none.
 */
function OnceValues({ values }: { values: Reported }) {
  const numbers = Object.keys(values.numbers);
  const texts = Object.entries(values.texts);
  return (
    <>
      {numbers.length > 0 && (
        <dl className={classes.metrics} aria-label="Values">
          {numbers.map((name) => (
            <div key={name} className={classes.metric}>
              <dt>{name}</dt>
              <dd>{valueText(values, name)}</dd>
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

/**
 * The task's folds over what the reader is shown of the run, such as the
 * longest time over its tests: each by name, as an exact number. Nothing
 * when the task folds nothing or none is shown yet.
 */
function FoldedValues({ folded }: { folded: Record<string, string> }) {
  const names = Object.keys(folded);
  if (names.length === 0) return null;
  return (
    <dl className={classes.metrics} aria-label="Over the tests">
      {names.map((name) => (
        <div key={name} className={classes.metric}>
          <dt>{name}</dt>
          <dd>{formatExact(folded[name] ?? '0')}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * One row per test of a group, with its own outcome and each value its steps
 * reported for it, such as its time and memory, a column per value; then the
 * credit it earned and, where it is scored against the best, that best `B`,
 * so the one can be checked against the other (section 3.2). A column none of
 * the rows has is left out.
 */
function Tests({ group }: { group: GroupShown }) {
  const rows = group.tests ?? [];
  if (rows.length === 0) return null;
  const names = [
    ...new Set(
      rows.flatMap((row) => [
        ...Object.keys(row.values.numbers),
        ...Object.keys(row.values.texts),
      ]),
    ),
  ];
  const credited = rows.some((row) => row.credit !== null);
  const bested = rows.some((row) => row.best !== null);
  return (
    <table className={classes.table} aria-label={`Tests ${group.group}`}>
      <thead>
        <tr>
          <th scope="col">Test</th>
          <th scope="col">Outcome</th>
          {names.map((name) => (
            <th key={name} scope="col">
              {name}
            </th>
          ))}
          {credited && <th scope="col">Credit</th>}
          {bested && <th scope="col">Best</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.test}>
            <th scope="row" className={classes.mono}>
              {row.test}
            </th>
            <td>
              <VerdictBadge verdict={row.outcome} />
            </td>
            {names.map((name) => (
              <td key={name}>{valueText(row.values, name) ?? '—'}</td>
            ))}
            {credited && <td>{row.credit === null ? '—' : formatExact(row.credit)}</td>}
            {bested && <td>{row.best === null ? '—' : formatExact(row.best)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * One test group as the result shows it: its outcome once its verdict is
 * shown, its tests once they are, and, under `shownAt`'s words, when what is
 * held back is shown. What the result leaves out is simply not shown, with
 * nothing in its place. A group that did not run on this grading says so
 * where its outcome would be.
 */
function Group({ group, shownAt }: { group: GroupShown; shownAt: string }) {
  const points = pointsText(group);
  return (
    <section className={classes.stack} aria-label={`Group ${group.group}`}>
      <div className={classes.verdict}>
        <span className={classes.group}>{group.group}</span>
        {!group.ran ? (
          <BodyText tone="secondary">Not run on this grading</BodyText>
        ) : (
          group.outcome !== null && <VerdictBadge verdict={group.outcome} />
        )}
        {points !== null && (
          <BodyText tone="secondary" mono>
            {points} points
          </BodyText>
        )}
      </div>
      {group.shown_at !== null && (
        <BodyText tone="secondary">
          {shownAt} {formatDateTime(new Date(group.shown_at))}
        </BodyText>
      )}
      <Tests group={group} />
    </section>
  );
}

/**
 * What a grading's result holds beside where it stands: its points with the
 * late factor they include, what the run reported once, the folds over its
 * tests, and each test group. A contestant reads it as the task shows it now;
 * organisers read the same payload with everything filled in, where each
 * group's time says when its contestant sees it (`shownAt`).
 */
export function ScoredResult({
  grading,
  shownAt = 'Shown at',
}: {
  grading: ScoredGrading;
  shownAt?: string;
}) {
  return (
    <>
      {grading.points !== null && (
        <BodyText>
          {formatExact(grading.points.shown, 2)} points
          {grading.points.pending_until !== null &&
            `, and up to ${formatExact(grading.points.pending, 2)} more shown at ${formatDateTime(new Date(grading.points.pending_until))}`}
          {grading.factor !== null &&
            grading.factor !== '1' &&
            `, at ${formatExact(grading.factor, 4)} for lateness`}
        </BodyText>
      )}
      <OnceValues values={grading.values} />
      <FoldedValues folded={grading.folded} />
      {grading.groups.map((group) => (
        <Group key={group.group} group={group} shownAt={shownAt} />
      ))}
    </>
  );
}
