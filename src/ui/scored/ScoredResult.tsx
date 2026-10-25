import { useRef, useState } from 'react';
import type { OnceShown, RunShown, RunValue, ValueMeaning } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { ShownValue } from '@/ui/number/ShownValue';
import { RESULTS_AFTER } from '@/ui/number/words';
import { VerdictBadge } from '@/ui/VerdictBadge';
import { formatDateTime } from '@/lib/time';
import { tupleLine } from './scored-text';
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

/** What a result view reads: the values shown, the runs, and what was reported once. */
type ShownResult = {
  status?: string;
  meanings: ValueMeaning[];
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
 * What a page names a value a run reports by: the title its workflow gives
 * it, "Run time", or its name until it has one.
 */
function titleOf(name: string, meanings: readonly ValueMeaning[]): string {
  return meanings.find((meaning) => meaning.name === name)?.title ?? name;
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
  const unit =
    number === null
      ? null
      : (meanings.find((meaning) => meaning.name === name)?.unit ?? null);
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
          {titleOf(name, meanings)}{' '}
          <NumberShown name={name} number={number} meanings={meanings} />
        </span>
      ))}
      {Object.entries(run.texts).map(([name, ref]) => (
        <OpenText
          key={name}
          title={titleOf(name, meanings)}
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
              <dt>{titleOf(name, meanings)}</dt>
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
          title={titleOf(name, meanings)}
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
  // Nothing shown yet: said only of a submission whose results come after
  // the contest; one still queued or grading says so where it stands.
  if (!shown) {
    if (grading.status !== 'submitted') return null;
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
              <dt>{titleOf(value.name, meanings)}</dt>
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
 * What a grading's result holds beside where it stands: the values its
 * entrant is shown, each run, and what its steps done once reported, each
 * value by its title. Staff read the same, with every value and run there
 * and the facts the values read.
 */
export function ScoredResult({
  grading,
  readText,
}: {
  grading: ShownResult;
  readText?: (ask: TextAsk) => Promise<string>;
}) {
  return <RunResult grading={grading} readText={readText} />;
}
