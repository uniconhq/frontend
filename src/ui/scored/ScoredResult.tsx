import type { GroupShown, Reported, ValueMeaning } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { VerdictBadge } from '@/ui/VerdictBadge';
import { formatDateTime } from '@/lib/time';
import { inReportOrder, meaningOf, valueTitle, withUnit } from '@/lib/values';
import { valueText } from './scored-text';
import classes from './scored.module.css';

/** What a result view reads: groups, the values reported once, and how each is named. */
type ShownResult = {
  groups: GroupShown[];
  meanings: ValueMeaning[];
  values: Reported;
};

/**
 * The values a run reported once, such as a compile log, in the workflow's
 * report order and by their titles: each number in a list of names and
 * values, its unit after it, and each text as a block of its own, kept as
 * the run wrote it and never read as markup. Nothing when there are none.
 */
function OnceValues({
  values,
  meanings,
}: {
  values: Reported;
  meanings: ValueMeaning[];
}) {
  const numbers = inReportOrder(Object.keys(values.numbers), meanings);
  const texts = inReportOrder(Object.keys(values.texts), meanings).filter(
    (name) => values.texts[name] !== '',
  );
  return (
    <>
      {numbers.length > 0 && (
        <dl className={classes.metrics} aria-label="Values">
          {numbers.map((name) => {
            const meaning = meaningOf(meanings, name);
            return (
              <div key={name} className={classes.metric}>
                <dt>{valueTitle(name, meaning)}</dt>
                <dd>
                  <span className={classes.number}>
                    {withUnit(valueText(values, name) ?? '', meaning)}
                  </span>
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      {texts.map((name) => {
        const title = valueTitle(name, meaningOf(meanings, name));
        return (
          <div key={name} className={classes.once}>
            <BodyText tone="secondary">{title}</BodyText>
            <pre className={classes.pre} aria-label={title} tabIndex={0}>
              {values.texts[name]}
            </pre>
          </div>
        );
      })}
    </>
  );
}

/**
 * One row per test of a group, with its own outcome and each value its steps
 * reported for it, such as its time and memory, a column per value by its
 * title, in the workflow's report order, each number with its unit. A column
 * none of the rows has is left out.
 */
function Tests({ group, meanings }: { group: GroupShown; meanings: ValueMeaning[] }) {
  const rows = group.tests ?? [];
  if (rows.length === 0) return null;
  const names = inReportOrder(
    [
      ...new Set(
        rows.flatMap((row) => [
          ...Object.keys(row.values.numbers),
          ...Object.keys(row.values.texts),
        ]),
      ),
    ],
    meanings,
  );
  return (
    <table className={classes.table} aria-label={`Tests ${group.group}`}>
      <thead>
        <tr>
          <th scope="col">Test</th>
          <th scope="col">Outcome</th>
          {names.map((name) => (
            <th key={name} scope="col">
              {valueTitle(name, meaningOf(meanings, name))}
            </th>
          ))}
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
            {names.map((name) => {
              const text = valueText(row.values, name);
              return (
                <td key={name}>
                  {text === undefined
                    ? '—'
                    : name in row.values.numbers
                      ? withUnit(text, meaningOf(meanings, name))
                      : text}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * One test group as the result shows it: its outcome once its verdict is
 * shown, its tests once they are, and when what is held back is shown: under
 * `testsShownAt`'s words for a group whose verdict is shown and only its
 * tests wait, under `shownAt`'s for one held back whole. What the result leaves out is simply not shown, with
 * nothing in its place. A group that did not run on this grading says so
 * where its outcome would be.
 */
function Group({
  group,
  shownAt,
  testsShownAt,
  meanings,
}: {
  group: GroupShown;
  shownAt: string;
  testsShownAt: string;
  meanings: ValueMeaning[];
}) {
  return (
    <section className={classes.stack} aria-label={`Group ${group.group}`}>
      <div className={classes.verdict}>
        <span className={classes.group}>{group.group}</span>
        {!group.ran ? (
          <BodyText tone="secondary">Not run on this grading</BodyText>
        ) : (
          group.outcome !== null && <VerdictBadge verdict={group.outcome} />
        )}
      </div>
      {group.shown_at !== null && (
        <BodyText tone="secondary">
          {group.show === 'verdict' ? testsShownAt : shownAt}{' '}
          {formatDateTime(new Date(group.shown_at))}
        </BodyText>
      )}
      <Tests group={group} meanings={meanings} />
    </section>
  );
}

/**
 * What a grading's result holds beside where it stands: what the run
 * reported once, and each test group. A contestant reads it as the task shows
 * it now; organisers read the same groups, tests and reported values, where
 * each group's time says when its contestant sees it (`shownAt`, and
 * `testsShownAt` for a group whose tests alone wait).
 */
export function ScoredResult({
  grading,
  shownAt = 'Shown at',
  testsShownAt = 'Tests shown at',
}: {
  grading: ShownResult;
  shownAt?: string;
  testsShownAt?: string;
}) {
  return (
    <>
      <OnceValues values={grading.values} meanings={grading.meanings} />
      {grading.groups.map((group) => (
        <Group
          key={group.group}
          group={group}
          shownAt={shownAt}
          testsShownAt={testsShownAt}
          meanings={grading.meanings}
        />
      ))}
    </>
  );
}
