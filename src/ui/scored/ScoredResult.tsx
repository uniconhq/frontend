import { useRef, useState } from 'react';
import type {
  GroupShown,
  OnceShown,
  Reported,
  RunShown,
  RunValue,
  ValueMeaning,
} from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { ShownValue } from '@/ui/number/ShownValue';
import { RESULTS_AFTER } from '@/ui/number/words';
import { VerdictBadge } from '@/ui/VerdictBadge';
import { formatDateTime } from '@/lib/time';
import { inReportOrder, meaningOf, valueTitle, withUnit } from '@/lib/values';
import { tupleLine, valueText } from './scored-text';
import classes from './scored.module.css';

/**
 * Where a text is shown, so the page can read it when it is opened: a run's,
 * by the group and place, or the steps done once, with neither.
 */
export type TextAsk = {
  group: string | null;
  place: number | null;
  field: 'texts' | 'label' | 'message';
  name: string | null;
  /** The stored output, which staff read a text by. An entrant is not told it. */
  output?: string | null;
};

/** What a result view reads. A run task fills `runs` and `run_values`; a test-by-test task fills `groups`. */
type ShownResult = {
  status?: string;
  groups: GroupShown[];
  meanings: ValueMeaning[];
  values: Reported;
  runs?: RunShown[];
  run_values?: RunValue[];
  once?: OnceShown;
  reveal_at?: string | null;
  facts?: Record<string, string>;
  compiled?: number | null;
};

const SHOWN_AT: Record<NonNullable<RunValue['show']>, string> = {
  now: 'Now',
  after_close: 'After the close',
  on_release: 'On release',
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

/** A run task's result, rather than one graded test by test. */
function showsRuns(grading: ShownResult): boolean {
  return (
    (grading.runs?.length ?? 0) > 0 ||
    (grading.run_values?.length ?? 0) > 0 ||
    grading.status === 'submitted' ||
    hasFacts(grading)
  );
}

function hasFacts(grading: ShownResult): boolean {
  return Object.keys(grading.facts ?? {}).length > 0 || grading.compiled != null;
}

function groupsOf(runs: RunShown[]): { name: string; runs: RunShown[] }[] {
  const order: string[] = [];
  const by = new Map<string, RunShown[]>();
  for (const run of runs) {
    const list = by.get(run.group);
    if (list === undefined) {
      order.push(run.group);
      by.set(run.group, [run]);
    } else {
      list.push(run);
    }
  }
  return order.map((name) => ({ name, runs: by.get(name) ?? [] }));
}

/** A number as 6.1, with its unit after it when the value has one. */
function NumberShown({
  name,
  number,
  text = null,
  waiting = false,
  meanings,
}: {
  name: string;
  number: string | null;
  text?: string | null;
  waiting?: boolean;
  meanings: ValueMeaning[];
}) {
  const unit = number === null ? null : (meaningOf(meanings, name)?.unit ?? null);
  return (
    <>
      <ShownValue number={number} text={text} waiting={waiting} />
      {unit !== null && unit !== '' ? ` ${unit}` : null}
    </>
  );
}

/** A text, read the first time it is opened and then shown as the step wrote it. */
function OpenText({
  title,
  ask,
  readText,
}: {
  title: string;
  ask: TextAsk;
  readText?: (ask: TextAsk) => Promise<string>;
}) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const asked = useRef(false);
  if (readText === undefined) return null;
  if (text !== null) {
    return (
      <pre className={classes.pre} aria-label={title} tabIndex={0}>
        {text}
      </pre>
    );
  }
  return (
    <>
      <Button
        size="xs"
        variant="secondary"
        label={`Show ${title}`}
        onClick={() => {
          if (asked.current) return;
          asked.current = true;
          void readText(ask)
            .then((found) => {
              setFailed(false);
              setText(found);
            })
            .catch(() => {
              asked.current = false;
              setFailed(true);
            });
        }}
      >
        {`Show ${title}`}
      </Button>
      {failed && <BodyText tone="secondary">This text could not be read.</BodyText>}
    </>
  );
}

function RunRow({
  run,
  meanings,
  readText,
}: {
  run: RunShown;
  meanings: ValueMeaning[];
  readText?: (ask: TextAsk) => Promise<string>;
}) {
  const line = tupleLine(run.titles, run.key);
  const ask = { group: run.group, place: run.place };
  return (
    <div className={classes.run}>
      <BodyText>{`Test ${String(run.place)}`}</BodyText>
      {line !== '' && <BodyText>{line}</BodyText>}
      <VerdictBadge verdict={run.verdict} />
      {run.dropped && <BodyText tone="secondary">Dropped</BodyText>}
      {Object.entries(run.reports).map(([name, number]) => (
        <span key={name}>
          {valueTitle(name, meaningOf(meanings, name))}{' '}
          <NumberShown name={name} number={number} meanings={meanings} />
        </span>
      ))}
      {Object.entries(run.texts).map(([name, ref]) => (
        <OpenText
          key={name}
          title={valueTitle(name, meaningOf(meanings, name))}
          ask={{ ...ask, field: 'texts', name: ref.name ?? name, output: ref.output }}
          readText={readText}
        />
      ))}
      {run.label !== null && (
        <OpenText
          title="Label"
          ask={{
            ...ask,
            field: 'label',
            name: run.label.name,
            output: run.label.output,
          }}
          readText={readText}
        />
      )}
      {run.message !== null && (
        <OpenText
          title="Message"
          ask={{
            ...ask,
            field: 'message',
            name: run.message.name,
            output: run.message.output,
          }}
          readText={readText}
        />
      )}
    </div>
  );
}

function OnceReports({
  once,
  meanings,
  readText,
}: {
  once: OnceShown;
  meanings: ValueMeaning[];
  readText?: (ask: TextAsk) => Promise<string>;
}) {
  const reports = Object.entries(once.reports);
  const texts = Object.keys(once.texts);
  if (reports.length === 0 && texts.length === 0) return null;
  return (
    <div className={classes.stack}>
      {reports.length > 0 && (
        <dl className={classes.metrics} aria-label="Once">
          {reports.map(([name, number]) => (
            <div key={name} className={classes.metric}>
              <dt>{valueTitle(name, meaningOf(meanings, name))}</dt>
              <dd>
                <NumberShown name={name} number={number} meanings={meanings} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {texts.map((name) => (
        <OpenText
          key={name}
          title={valueTitle(name, meaningOf(meanings, name))}
          ask={{
            group: null,
            place: null,
            field: 'texts',
            name: once.texts[name]?.name ?? name,
            output: once.texts[name]?.output,
          }}
          readText={readText}
        />
      ))}
    </div>
  );
}

function RunResult({
  grading,
  readText,
}: {
  grading: ShownResult;
  readText?: (ask: TextAsk) => Promise<string>;
}) {
  const runs = grading.runs ?? [];
  const values = grading.run_values ?? [];
  const once = grading.once ?? { reports: {}, texts: {} };
  const meanings = grading.meanings;
  const shown =
    runs.length > 0 ||
    values.length > 0 ||
    Object.keys(once.reports).length > 0 ||
    Object.keys(once.texts).length > 0 ||
    hasFacts(grading);
  if (!shown) {
    return (
      <>
        <BodyText>{RESULTS_AFTER}</BodyText>
        {grading.reveal_at != null && grading.reveal_at !== '' && (
          <BodyText tone="secondary">
            {`Results at ${formatDateTime(new Date(grading.reveal_at))}`}
          </BodyText>
        )}
      </>
    );
  }
  return (
    <div className={classes.stack}>
      {values.length > 0 && (
        <dl className={classes.metrics} aria-label="Values">
          {values.map((value) => (
            <div key={value.name} className={classes.metric}>
              <dt>{valueTitle(value.name, meaningOf(meanings, value.name))}</dt>
              <dd>
                <NumberShown
                  name={value.name}
                  number={value.number}
                  text={value.text}
                  waiting={value.waiting}
                  meanings={meanings}
                />
                {value.show !== null && ` ${SHOWN_AT[value.show]}`}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {groupsOf(runs).map((group) => (
        <section
          key={group.name}
          aria-label={`Group ${group.name}`}
          className={classes.stack}
        >
          <BodyText>{group.name}</BodyText>
          {group.runs.map((run) => (
            <RunRow
              key={`${run.group}:${String(run.place)}`}
              run={run}
              meanings={meanings}
              readText={readText}
            />
          ))}
        </section>
      ))}
      <OnceReports once={once} meanings={meanings} readText={readText} />
      <Facts facts={grading.facts} compiled={grading.compiled} />
    </div>
  );
}

function Facts({
  facts,
  compiled,
}: {
  facts: Record<string, string> | undefined;
  compiled: number | null | undefined;
}) {
  const rows = Object.entries(facts ?? {});
  if (compiled != null && facts?.compiled === undefined)
    rows.push(['compiled', String(compiled)]);
  if (rows.length === 0) return null;
  return (
    <dl className={classes.metrics} aria-label="Facts">
      {rows.map(([name, number]) => (
        <div key={name} className={classes.metric}>
          <dt>{factTitle(name)}</dt>
          <dd>{number}</dd>
        </div>
      ))}
    </dl>
  );
}

function factTitle(name: string): string {
  if (name === 'seconds_late') return 'Seconds late';
  if (name === 'seconds') return 'Seconds';
  if (name === 'compiled') return 'Compiled';
  return name;
}

/**
 * What a grading's result holds beside where it stands: what the run
 * reported once, and each test group. A contestant reads it as the task shows
 * it now; organisers read the same groups, tests and reported values, where
 * each group's time says when its contestant sees it (`shownAt`, and
 * `testsShownAt` for a group whose tests alone wait). A run task shows its
 * values and its runs instead.
 */
export function ScoredResult({
  grading,
  shownAt = 'Shown at',
  testsShownAt = 'Tests shown at',
  readText,
}: {
  grading: ShownResult;
  shownAt?: string;
  testsShownAt?: string;
  readText?: (ask: TextAsk) => Promise<string>;
}) {
  if (showsRuns(grading)) return <RunResult grading={grading} readText={readText} />;
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
