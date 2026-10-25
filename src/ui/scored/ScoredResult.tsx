import { useRef, useState } from 'react';
import type {
  GradingResult,
  OnceShown,
  OrganisedResult,
  RunShown,
  RunValue,
} from '@/api/types';
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

/** What a result view reads: an entrant's result, or the one staff read with everything filled in. */
type ShownResult = GradingResult | OrganisedResult;

const SHOWN_AT: Record<NonNullable<RunValue['show']>, string> = {
  now: 'Now',
  after_close: 'After the close',
  on_release: 'On release',
};

function factsOf(grading: ShownResult): Record<string, string> {
  return 'facts' in grading ? grading.facts : {};
}

function hasFacts(grading: ShownResult): boolean {
  return Object.keys(factsOf(grading)).length > 0 || grading.compiled !== null;
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
  readText,
}: {
  run: RunShown;
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
          {name} <ShownValue number={number} />
        </span>
      ))}
      {Object.entries(run.texts).map(([name, ref]) => (
        <OpenText
          key={name}
          title={name}
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
  readText,
}: {
  once: OnceShown;
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
              <dt>{name}</dt>
              <dd>
                <ShownValue number={number} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {texts.map((name) => (
        <OpenText
          key={name}
          title={name}
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

/**
 * What a grading's result holds beside where it stands: the values its
 * entrant is shown, each run, and what its steps done once reported, each
 * value by its name. Staff read the same, with every value and run there
 * and the facts the values read.
 */
export function ScoredResult({
  grading,
  readText,
}: {
  grading: ShownResult;
  readText?: (ask: TextAsk) => Promise<string>;
}) {
  const runs = grading.runs;
  const values = grading.run_values;
  const once = grading.once;
  const shown =
    runs.length > 0 ||
    values.length > 0 ||
    Object.keys(once.reports).length > 0 ||
    Object.keys(once.texts).length > 0 ||
    hasFacts(grading);
  // Nothing shown yet: said only of a submission whose results come after
  // the contest; one still queued or grading says so where it stands.
  if (!shown) {
    if (grading.status !== 'submitted' || !('reveal_at' in grading)) return null;
    return (
      <>
        <BodyText>{RESULTS_AFTER}</BodyText>
        {grading.reveal_at !== null && grading.reveal_at !== '' && (
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
              <dt>{value.name}</dt>
              <dd>
                <ShownValue
                  number={value.number}
                  text={value.text}
                  waiting={value.waiting}
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
              readText={readText}
            />
          ))}
        </section>
      ))}
      <OnceReports once={once} readText={readText} />
      <Facts facts={factsOf(grading)} compiled={grading.compiled} />
    </div>
  );
}

function Facts({
  facts,
  compiled,
}: {
  facts: Record<string, string>;
  compiled: number | null;
}) {
  const rows = Object.entries(facts);
  if (compiled !== null && facts['compiled'] === undefined)
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
