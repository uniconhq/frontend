import type {
  GroupShown,
  OnBoard,
  Reported,
  ScoredGrading,
  ValueMeaning,
} from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { VerdictBadge } from '@/ui/VerdictBadge';
import { keyLabel } from '@/ui/boards/board-text';
import { formatExact, formatPoints, withPointsWord } from '@/lib/exact';
import { formatDateTime } from '@/lib/time';
import { inReportOrder, meaningOf, valueTitle, withUnit } from '@/lib/values';
import { pointsText, valueText } from './scored-text';
import classes from './scored.module.css';

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
 * One board's line in words: each number by what it is, "24 points", "Run
 * time, highest: 15 ms", or "no value" where a test shown was not accepted
 * (#441); what the board's hidden groups could still add; whether the board
 * counts this submission; and, while the board shows nothing of the task
 * yet, when it does instead.
 */
function lineText(line: OnBoard): string {
  if (line.shown_at !== null) {
    return [
      `shown at ${formatDateTime(new Date(line.shown_at))}`,
      ...(line.counted ? ['counts here'] : []),
    ].join(' · ');
  }
  const numbers = line.numbers.flatMap((number) => {
    if (number.by === 'points') {
      return number.value === null ? [] : [withPointsWord(formatPoints(number.value))];
    }
    const label = keyLabel({ ...number, per_attempt: null });
    return [
      `${label}: ${number.value === null ? 'no value' : withUnit(formatExact(number.value), number)}`,
    ];
  });
  const pending =
    line.pending !== null && Number(line.pending) > 0
      ? [`up to ${formatPoints(line.pending)} more at the reveal`]
      : [];
  return [...numbers, ...pending, ...(line.counted ? ['counts here'] : [])].join(' · ');
}

/**
 * Where the submission stands on each leaderboard its reader sees that covers
 * the task, read as that board reads it: its scope, the values it ranks
 * combined across the tests as it says, and whether it counts this one.
 * Boards whose lines read alike share one, naming them all. Nothing when no
 * board covers the task.
 */
function OnBoards({ boards }: { boards: OnBoard[] }) {
  const lines = new Map<string, { names: string[]; text: string }>();
  for (const line of boards) {
    const text = lineText(line);
    const key = `${line.over} ${text}`;
    const found = lines.get(key);
    if (found === undefined) lines.set(key, { names: [line.board], text });
    else found.names.push(line.board);
  }
  if (lines.size === 0) return null;
  return (
    <section className={classes.boards} aria-label="On the leaderboards">
      <BodyText tone="secondary">On the leaderboards</BodyText>
      <ul className={classes.boardLines}>
        {[...lines].map(([key, { names, text }]) => (
          <li key={key}>
            {names.join(', ')}: {text}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * One row per test of a group, with its own outcome and each value its steps
 * reported for it, such as its time and memory, a column per value by its
 * title, in the workflow's report order, each number with its unit; then the
 * credit it earned and, where it is scored against the best, that best `B`,
 * so the one can be checked against the other (section 3.2). A column none of
 * the rows has is left out.
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
              {valueTitle(name, meaningOf(meanings, name))}
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
          {group.show === 'verdict' ? testsShownAt : shownAt}{' '}
          {formatDateTime(new Date(group.shown_at))}
        </BodyText>
      )}
      <Tests group={group} meanings={meanings} />
    </section>
  );
}

/**
 * What a grading's result holds beside where it stands: its points with the
 * late factor they include, what the run reported once, its line on each
 * leaderboard covering the task, and each test group. A contestant reads it as the task shows it now;
 * organisers read the same payload with everything filled in, where each
 * group's time says when its contestant sees it (`shownAt`, and
 * `testsShownAt` for a group whose tests alone wait).
 */
export function ScoredResult({
  grading,
  shownAt = 'Shown at',
  testsShownAt = 'Tests shown at',
}: {
  grading: ScoredGrading;
  shownAt?: string;
  testsShownAt?: string;
}) {
  return (
    <>
      {grading.points !== null && (
        <BodyText>
          {grading.points.shown === null
            ? 'No points shown yet'
            : withPointsWord(formatPoints(grading.points.shown))}
          {grading.points.pending_until !== null &&
            (grading.points.shown === null
              ? `: up to ${formatPoints(grading.points.pending)}, shown at ${formatDateTime(new Date(grading.points.pending_until))}`
              : `, and up to ${formatPoints(grading.points.pending)} more shown at ${formatDateTime(new Date(grading.points.pending_until))}`)}
          {grading.factor !== null &&
            grading.factor !== '1' &&
            `, at ${formatExact(grading.factor, 4)} for lateness`}
        </BodyText>
      )}
      <OnceValues values={grading.values} meanings={grading.meanings} />
      <OnBoards boards={grading.boards} />
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
