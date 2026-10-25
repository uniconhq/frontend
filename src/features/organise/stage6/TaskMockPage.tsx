import { useEffect, useState, type DragEvent, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { FileDrop } from '@/ui/FileDrop';
import { Modal } from '@/ui/Modal';
import { Page, PageHeader } from '@/ui/Page';
import { PageLink } from '@/ui/PageLink';
import { Select } from '@/ui/Select';
import { Textarea } from '@/ui/Textarea';
import { TextInput } from '@/ui/TextInput';
import { formatDateTime } from '@/lib/time';
import { BuildCard, CardPart } from '../task/BuildCard';
import { SaveBar } from '../task/SaveBar';
import task from '../task/task.module.css';
import { FormulaLine, FormulaTiles } from './FormulaEditor';
import { BoxGraph } from './BoxGraph';
import {
  describeFormula,
  namesIn,
  readLine,
  type FormulaNode,
  type FormulaScope,
  type Reading,
} from './formula';
import {
  SMALL,
  type GraphBox,
  type GraphPort,
  type GraphWire,
  type Shape,
} from './graph';
import { useFormulaTarget } from './useFormulaTarget';
import { MockLinks } from './MockLinks';
import classes from './stage6.module.css';

type Mode = 'set' | 'per run' | 'entrant' | 'entrant per run';
type When = 'now' | 'after_close' | 'on_release' | 'never';
type Kind = 'folder' | 'file' | 'choice' | 'number' | 'text';
type Input = {
  id: string;
  type: Kind;
  /** What the workflow says the input is. */
  said: string;
  unit?: string;
  mode: Mode;
  value: string;
  label: string;
  maxSize: string;
  choices: string;
  least: string;
  most: string;
  start: string;
};
type Run = {
  id: string;
  title: string;
  cells: Record<string, string | null>;
  maxSize: string;
};
type Group = { key: string; name: string; runs: string[] };
type Value = { key: string; name: string; text: string };
type Gives = { name: string; line: string; number: boolean };
type Named = { name: string; line: string };
type Check = {
  id: string;
  title: string;
  given: Record<string, string>;
  expect: 'verdict' | 'value';
  verdict: string;
  value: string;
  number: string;
  passed: boolean;
};
type Spec = {
  workflow: string;
  version: string;
  versions: { value: string; label: string }[];
  latest: string;
  /** What moving to each other version changes, as the save would say it. */
  moves: Record<string, string[]>;
  gives: Gives[];
  inputs: Input[];
  rows: Run[];
  groups: Group[];
  values: Value[];
  facts: Named[];
  folders: Named[];
  show: Record<string, When>;
  /** When the published version shows each, which the open contest has shown if now. */
  shown: Record<string, When>;
  checks: Check[];
  statement: string;
};

const MODES: { value: Mode; label: string }[] = [
  { value: 'set', label: 'You set it' },
  { value: 'per run', label: 'One per run, set in Runs' },
  { value: 'entrant', label: 'The entrant gives it' },
  { value: 'entrant per run', label: 'The entrant gives one per run' },
];

const WHEN: { value: When; label: string }[] = [
  { value: 'now', label: 'Now' },
  { value: 'after_close', label: 'After the contest closes' },
  { value: 'on_release', label: 'When staff release results' },
  { value: 'never', label: 'Not shown' },
];

const VERDICTS = [
  'accepted',
  'wrong_answer',
  'time_limit',
  'memory_limit',
  'runtime_error',
  'compile_error',
];

const SUBMISSIONS = 38;
const PUBLISHED = 3;

const FACTS: Named[] = [
  {
    name: 'seconds_late',
    line: 'A fact: how many seconds after the due time it came in',
  },
];

const PASSED: Gives = {
  name: 'passed',
  line: '1 if the run was accepted, else 0. From Unicon, on every run.',
  number: true,
};
const VERDICT: Gives = {
  name: 'verdict',
  line: 'accepted, wrong_answer, time_limit and so on: text, so a formula can compare it or pass it on, but not do maths on it.',
  number: false,
};

const input = (
  id: string,
  type: Kind,
  said: string,
  mode: Mode,
  more: Partial<Input> = {},
): Input => ({
  id,
  type,
  said,
  mode,
  value: '',
  label: '',
  maxSize: '',
  choices: '',
  least: '',
  most: '',
  start: '',
  ...more,
});

function run(
  id: string,
  title: string,
  cells: Record<string, string | null>,
  maxSize = '10MB',
): Run {
  return { id, title, cells, maxSize };
}

function islands(): Spec {
  const show: Record<string, When> = {
    sample_score: 'now',
    sample_time: 'now',
    sample_tests: 'now',
    'samples/': 'now',
    st1: 'after_close',
    st2: 'after_close',
    total: 'after_close',
    first_failed: 'after_close',
    all: 'after_close',
    'tests/': 'on_release',
  };
  return {
    workflow: 'unicon/classic',
    version: 'v3',
    versions: [
      { value: 'v3', label: 'v3, the latest' },
      { value: 'v2', label: 'v2' },
    ],
    latest: 'v3',
    moves: {
      v2: [
        'v2 builds with no lint step, so the entrant gets no style notes.',
        `Every run of all ${String(SUBMISSIONS)} submissions runs again.`,
      ],
    },
    gives: [
      PASSED,
      VERDICT,
      {
        name: 'points',
        line: 'From the score step: 1 for a match, else 0.',
        number: true,
      },
      { name: 'time_ms', line: 'How long the run took, in ms.', number: true },
    ],
    inputs: [
      input('code', 'folder', 'The code to build.', 'entrant', {
        label: 'Your solution',
        maxSize: '1MB',
      }),
      input('language', 'choice', 'Which compiler builds it.', 'entrant', {
        label: 'Language',
        choices: 'cpp, python',
        start: 'cpp',
      }),
      input('time_limit', 'number', 'Seconds each run may take.', 'set', {
        value: '2',
        unit: 'seconds',
      }),
      input('memory_limit', 'number', 'Megabytes each run may use.', 'set', {
        value: '256',
        unit: 'MB',
      }),
      input('input', 'file', 'What the program reads on this run.', 'per run'),
      input('answer', 'file', 'What it should print on this run.', 'per run'),
    ],
    rows: [
      run('s1', 'Sample 1', { input: 'samples/1.in', answer: 'samples/1.ans' }),
      run('s2', 'Sample 2', { input: 'samples/2.in', answer: 'samples/2.ans' }),
      run('t3', 'Small grid', { input: 'tests/3.in', answer: 'tests/3.ans' }),
      run('t4', 'Large grid', { input: 'tests/4.in', answer: 'tests/4.ans' }),
    ],
    groups: [
      { key: 'g1', name: 'sample_tests', runs: ['s1', 's2'] },
      { key: 'g2', name: 'st1_tests', runs: ['t3'] },
      { key: 'g3', name: 'st2_tests', runs: ['t3', 't4'] },
    ],
    values: [
      { key: 'v1', name: 'sample_score', text: 'sum(sample_tests.passed)' },
      { key: 'v2', name: 'sample_time', text: 'max(sample_tests.time_ms)' },
      { key: 'v3', name: 'st1', text: 'min(st1_tests.passed)' },
      { key: 'v4', name: 'st2', text: 'min(st2_tests.passed)' },
      { key: 'v5', name: 'total', text: '40 * st1 + 60 * st2' },
      {
        key: 'v6',
        name: 'first_failed',
        text: 'otherwise(first(all, all.passed == 0).verdict, "none")',
      },
    ],
    facts: FACTS,
    folders: [
      { name: 'samples/', line: 'The sample files' },
      { name: 'tests/', line: 'The hidden test files' },
    ],
    show,
    shown: show,
    checks: [
      {
        id: 'c1',
        title: 'Sample solution',
        given: { code: 'sol.cpp', language: 'cpp' },
        expect: 'value',
        verdict: 'accepted',
        value: 'total',
        number: '100',
        passed: true,
      },
      {
        id: 'c2',
        title: 'Too slow',
        given: { code: 'slow.py', language: 'python' },
        expect: 'verdict',
        verdict: 'time_limit',
        value: 'total',
        number: '',
        passed: true,
      },
    ],
    statement: 'Count the islands in the grid.',
  };
}

function tour(): Spec {
  const show: Record<string, When> = {
    score: 'now',
    'parts/': 'now',
    all: 'after_close',
  };
  return {
    workflow: 'unicon/tour',
    version: 'v1',
    versions: [
      { value: 'v1', label: 'v1' },
      { value: 'v2', label: 'v2, the latest' },
    ],
    latest: 'v2',
    moves: {
      v2: [
        'v2 adds an input, seed: a number you set. It starts at 0.',
        `Every run of all ${String(SUBMISSIONS)} submissions runs again.`,
      ],
    },
    gives: [
      PASSED,
      VERDICT,
      {
        name: 'points',
        line: "The best length known over the route's length, at most 1.",
        number: true,
      },
      { name: 'length', line: "The route's length.", number: true },
    ],
    inputs: [
      input('best', 'number', 'The shortest route length known.', 'set', {
        value: '1200',
      }),
      input('grid', 'file', 'The grid to cross on this run.', 'per run'),
      input(
        'route',
        'file',
        "The entrant's route across this run's grid.",
        'entrant per run',
        {
          label: 'Your route',
        },
      ),
    ],
    rows: [
      run('small', 'Small grid', { grid: 'parts/1.in' }, '10MB'),
      run('big', 'Big grid', { grid: 'parts/2.in' }, '50MB'),
    ],
    groups: [{ key: 'g1', name: 'big_grids', runs: ['big'] }],
    values: [
      { key: 'v1', name: 'score', text: 'sum(all.points) / count(all)' },
      { key: 'v2', name: 'big', text: 'max(big_grids.points)' },
    ],
    facts: FACTS,
    folders: [{ name: 'parts/', line: 'The grids' }],
    show,
    shown: show,
    checks: [
      {
        id: 'c1',
        title: 'Both grids',
        given: { 'route:small': 'small.out', 'route:big': 'big.out' },
        expect: 'value',
        verdict: 'accepted',
        value: 'score',
        number: '1',
        passed: true,
      },
    ],
    statement: 'Find a short route across each grid.',
  };
}

const PER_RUN = new Set<Mode>(['per run', 'entrant per run']);
const BY_FILE = new Set<Kind>(['file', 'folder']);

function stemOf(path: string): { stem: string; ending: string } {
  const base = path.split(/[/\\]/).pop() ?? path;
  const matched = /^(.*)\.([^.]+)$/.exec(base);
  return { stem: matched?.[1] ?? base, ending: matched?.[2] ?? '' };
}

type Pairing = {
  file: string;
  column: string | null;
  run: string | null;
  title: string;
};

/**
 * Where each dropped file goes: its ending picks the column, as the column's
 * files already end, and its name picks the run that holds a file of the
 * same name, or a new run.
 */
function pairFiles(names: string[], columns: Input[], rows: Run[]): Pairing[] {
  const fileColumns = columns.filter((column) => column.mode === 'per run');
  const endings = endingsOf(fileColumns, rows);
  return names.map((file) => {
    const { stem, ending } = stemOf(file);
    const column =
      fileColumns.length === 1
        ? (fileColumns[0]?.id ?? null)
        : (fileColumns.find((each) => endings[each.id] === ending || each.id === ending)
            ?.id ?? null);
    const row = rows.find((each) =>
      Object.values(each.cells).some(
        (cell) => cell !== null && stemOf(cell).stem === stem,
      ),
    );
    return { file, column, run: row?.id ?? null, title: row?.title ?? stem };
  });
}

function endingsOf(columns: Input[], rows: Run[]): Record<string, string> {
  return Object.fromEntries(
    columns.map((column) => {
      const cell = rows.map((row) => row.cells[column.id]).find((each) => each != null);
      return [column.id, cell == null ? column.id : stemOf(cell).ending];
    }),
  );
}

const READY = [
  ['workflow', 'Workflow'],
  ['inputs', 'Inputs'],
  ['runs', 'Runs'],
  ['scoring', 'Scoring'],
  ['checks', 'Checks'],
  ['statement', 'Statement'],
] as const;

/**
 * The task page's cards, with islands and tour filled in. Nothing is saved.
 */
export function TaskMockPage() {
  const [which, setWhich] = useState<'islands' | 'tour'>('islands');
  const [checksPass, setChecksPass] = useState(true);
  const [generation, setGeneration] = useState(0);
  const location = useLocation();
  useEffect(() => {
    const id = location.hash.slice(1);
    if (id === '') return;
    document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }, [location.hash]);
  const savedAt = formatDateTime(new Date('2026-10-24T01:14:00Z'));

  return (
    <Page label="Task">
      <PageHeader
        title={which === 'islands' ? 'Islands' : 'Tour'}
        links={<MockLinks />}
      >
        <div className={classes.switches}>
          <div className={classes.switch}>
            <Select
              label="Example"
              value={which}
              options={[
                { value: 'islands', label: 'Islands, one file per run' },
                { value: 'tour', label: 'Tour, one route per run' },
              ]}
              onChange={(value) => {
                setWhich(value === 'tour' ? 'tour' : 'islands');
                setGeneration((current) => current + 1);
              }}
            />
          </div>
          <div className={classes.switch}>
            <Select
              label="On the next save, the checks"
              value={checksPass ? 'pass' : 'fail'}
              options={[
                { value: 'pass', label: 'All pass' },
                { value: 'fail', label: 'One fails' },
              ]}
              onChange={(value) => setChecksPass(value === 'pass')}
            />
          </div>
        </div>
        <div className={task.status} aria-label="Where the task stands">
          <BodyText>
            Worth 100 points in NOI 2026. Open, due 1 Nov 2026, closes 2 Nov 2026.
          </BodyText>
          <div className={task.statusLine}>
            <Chip tone="live">Published</Chip>
            <BodyText tone="secondary">Last saved {savedAt} by ada</BodyText>
          </div>
          <ul className={task.ready} aria-label="What the task has">
            {READY.map(([id, label]) => (
              <li key={id}>
                <span className={task.tick} role="img" aria-label="Done">
                  ✓
                </span>
                <PageLink to={`/dev/stage-6/task#${id}`}>{label}</PageLink>
              </li>
            ))}
          </ul>
          <BodyText>
            Entrants are graded on version {PUBLISHED}, saved {savedAt} by ada.{' '}
            {SUBMISSIONS} submissions so far.
          </BodyText>
        </div>
      </PageHeader>
      <TaskEditor
        key={`${which}-${String(generation)}`}
        initial={which === 'tour' ? tour() : islands()}
        checksPass={checksPass}
        onDiscard={() => setGeneration((current) => current + 1)}
      />
    </Page>
  );
}

type Saving =
  | { stage: 'idle' }
  | { stage: 'asking' }
  | { stage: 'checking' }
  | { stage: 'done'; answer: ReactNode };

/** The lines that change what entrants get, so the save asks first. */
const REGRADES = ['Workflow', 'Inputs', 'Runs', 'Groups', 'Values'];

function TaskEditor({
  initial,
  checksPass,
  onDiscard,
}: {
  initial: Spec;
  checksPass: boolean;
  onDiscard: () => void;
}) {
  const [spec, setSpec] = useState(initial);
  const [lines, setLines] = useState<string[]>([]);
  const [saving, setSaving] = useState<Saving>({ stage: 'idle' });
  const [moving, setMoving] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const target = useFormulaTarget();
  const [pending, setPending] = useState<Pairing[]>([]);
  const perRun = spec.inputs.filter((each) => PER_RUN.has(each.mode));
  const entrantFiles = perRun.some(
    (each) => each.mode === 'entrant per run' && BY_FILE.has(each.type),
  );
  const endings = endingsOf(
    perRun.filter((each) => each.mode === 'per run'),
    spec.rows,
  );
  const scope = scopeOf(spec);
  // A value never reads itself, as its line says.
  const readings = Object.fromEntries(
    spec.values.map((value) => [
      value.key,
      readLine(value.text, {
        ...scope,
        names: scope.names.filter((name) => name !== value.name),
      }),
    ]),
  );
  const troubles = troublesOf(spec, readings);
  const graph = scoringGraph(spec, scope, readings, troubles, chosen);
  const setText = (key: string, text: string) =>
    patch(`Fields: ${spec.values.find((value) => value.key === key)?.name ?? ''}`, {
      values: spec.values.map((item) => (item.key === key ? { ...item, text } : item)),
    });
  const chosenValue = spec.values.find((value) => chosen === `v:${value.key}`);
  const chosenGroup =
    chosen === 'g:all'
      ? 'all'
      : spec.groups.find((group) => chosen === `g:${group.key}`)?.name;
  const problems = spec.values.flatMap((value) => {
    const reading = readings[value.key];
    const trouble = troubles.get(value.key);
    if (trouble !== undefined) return [`${value.name}: ${trouble}.`];
    if (reading === undefined) return [];
    if (reading.unread !== null) return [`${value.name}: ${reading.unread.message}`];
    const count = reading.problems.length;
    if (count === 0) return [];
    return [
      `${value.name} has ${count === 1 ? 'a problem' : `${String(count)} problems`}.`,
    ];
  });

  useEffect(() => {
    if (saving.stage !== 'checking') return;
    const timer = setTimeout(() => {
      const failing = spec.checks[0];
      setSaving({
        stage: 'done',
        answer:
          checksPass || failing === undefined ? (
            <BodyText>
              Published as version {PUBLISHED + 1}, and every check passed. Entrants are
              graded on it now.
            </BodyText>
          ) : (
            <>
              <BodyText>
                Version {PUBLISHED + 1} was refused: the check “{failing.title}” failed.
                Entrants stay on version {PUBLISHED}, and your changes are still here to
                fix.
              </BodyText>
              <BodyText tone="secondary">
                It should get{' '}
                {failing.expect === 'verdict'
                  ? failing.verdict
                  : `${failing.value} = ${failing.number}`}
                ; it got wrong_answer on {spec.rows.at(-1)?.title ?? 'a run'}.
              </BodyText>
            </>
          ),
      });
      if (checksPass) setLines([]);
    }, 1500);
    return () => clearTimeout(timer);
  }, [saving.stage, checksPass, spec.checks, spec.rows]);

  const touch = (line: string) => {
    if (saving.stage === 'done') setSaving({ stage: 'idle' });
    setLines((curr) => (curr.includes(line) ? curr : [...curr, line]));
  };
  const patch = (line: string, next: Partial<Spec>) => {
    setSpec((curr) => ({ ...curr, ...next }));
    touch(line);
  };
  const patchInput = (id: string, next: Partial<Input>) =>
    patch('Inputs', {
      inputs: spec.inputs.map((item) => (item.id === id ? { ...item, ...next } : item)),
    });
  const patchCheck = (id: string, next: Partial<Check>) =>
    patch('Checks', {
      checks: spec.checks.map((item) =>
        item.id === id ? { ...item, ...next, passed: false } : item,
      ),
    });

  const regrades = lines.filter((line) =>
    REGRADES.some((word) => line.startsWith(word)),
  );
  const reruns = regrades.some(
    (line) => line === 'Workflow' || line === 'Inputs' || line === 'Runs',
  );

  return (
    <>
      <div className={task.build}>
        <BuildCard
          id="workflow"
          title="Workflow"
          line="The run workflow this task grades with, which version, and what each run gives."
          aside={
            spec.version !== spec.latest ? (
              <Chip tone="warn">{spec.latest} is out</Chip>
            ) : undefined
          }
        >
          <div className={classes.switches}>
            <div className={classes.switch}>
              <Select
                label="Workflow"
                value={spec.workflow}
                options={[{ value: spec.workflow, label: spec.workflow }]}
                onChange={() => undefined}
              />
            </div>
            <div className={classes.switch}>
              <Select
                label="Version"
                value={spec.version}
                options={spec.versions}
                onChange={(version) => {
                  if (version !== spec.version) setMoving(version);
                }}
              />
            </div>
          </div>
          {spec.version !== spec.latest ? (
            <div>
              <Button variant="secondary" onClick={() => setMoving(spec.latest)}>
                Move to {spec.latest}
              </Button>
            </div>
          ) : (
            <BodyText size="sm" tone="secondary">
              This is the latest version.
            </BodyText>
          )}
          <CardPart
            title="Each run gives"
            line="Values read these as group.name, such as all.passed."
          >
            <dl className={classes.gives}>
              {spec.gives.map((give) => (
                <div key={give.name} className={classes.give}>
                  <dt>{give.name}</dt>
                  <dd>{give.line}</dd>
                </div>
              ))}
            </dl>
          </CardPart>
        </BuildCard>

        <BuildCard
          id="inputs"
          title="Inputs"
          line="What the workflow needs, and who gives each: you, once or per run, or the entrant."
        >
          {spec.inputs.map((item) => (
            <div key={item.id} className={task.item}>
              <div className={task.itemHead}>
                <h3 className={task.itemTitle}>{item.id}</h3>
                <Chip tone="quiet">{item.type}</Chip>
              </div>
              <BodyText size="sm" tone="secondary">
                {item.said}
              </BodyText>
              <div className={classes.narrow}>
                <Select
                  label="Who gives it"
                  value={item.mode}
                  options={MODES}
                  onChange={(mode) => patchInput(item.id, { mode: mode as Mode })}
                />
              </div>
              {item.mode === 'set' && (
                <SetField
                  item={item}
                  onChange={(value) => patchInput(item.id, { value })}
                />
              )}
              {item.mode === 'entrant' && (
                <EntrantFields
                  item={item}
                  onChange={(next) => patchInput(item.id, next)}
                />
              )}
              {item.mode === 'per run' && (
                <BodyText size="sm" tone="secondary">
                  A column in Runs: you give one for each run.
                </BodyText>
              )}
              {item.mode === 'entrant per run' && (
                <>
                  <div className={classes.narrow}>
                    <TextInput
                      label="Label on the submit form"
                      value={item.label}
                      onChange={(label) => patchInput(item.id, { label })}
                    />
                  </div>
                  <BodyText size="sm" tone="secondary">
                    A column in Runs: the entrant gives one for each run, each with its
                    own largest size.
                  </BodyText>
                </>
              )}
            </div>
          ))}
        </BuildCard>

        <BuildCard
          id="runs"
          title="Runs"
          line="One row is one run. Each input given per run is a column."
        >
          {perRun.some((each) => each.mode === 'per run' && BY_FILE.has(each.type)) && (
            <FileDrop
              label="Add a set of files"
              description={`Files with the same name go in one run. The ending picks the column: ${Object.entries(
                endings,
              )
                .map(([column, ending]) => `.${ending} for ${column}`)
                .join(', ')}.`}
              multiple
              files={[]}
              onChange={(files) =>
                setPending(
                  pairFiles(
                    files.map((file) => file.name),
                    perRun,
                    spec.rows,
                  ),
                )
              }
            />
          )}
          {pending.length > 0 && (
            <div className={task.item}>
              <h3 className={task.itemTitle}>Where these files go</h3>
              <ul className={classes.pairs}>
                {pending.map((pair) => (
                  <li key={pair.file}>
                    <code>{pair.file}</code> →{' '}
                    {pair.column === null
                      ? 'no column ends this way, so it is left out'
                      : `${pair.run === null ? 'a new run' : 'run'}, ${pair.title}, ${pair.column}${
                          pair.run !== null &&
                          spec.rows.find((row) => row.id === pair.run)?.cells[
                            pair.column
                          ] != null
                            ? ' (replaces the file there)'
                            : ''
                        }`}
                  </li>
                ))}
              </ul>
              <div className={task.statusLine}>
                <Button
                  onClick={() => {
                    let rows = spec.rows.map((row) => ({
                      ...row,
                      cells: { ...row.cells },
                    }));
                    for (const pair of pending) {
                      if (pair.column === null) continue;
                      let row = rows.find(
                        (each) => each.id === (pair.run ?? `new-${pair.title}`),
                      );
                      if (row === undefined) {
                        row = run(`new-${pair.title}`, pair.title, {});
                        rows = [...rows, row];
                      }
                      row.cells[pair.column] = pair.file;
                    }
                    patch('Runs', { rows });
                    setPending([]);
                  }}
                >
                  Add these
                </Button>
                <Button variant="secondary" onClick={() => setPending([])}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          <table className={classes.table}>
            <thead>
              <tr>
                <th>Title</th>
                {perRun.map((column) => (
                  <th key={column.id}>{column.id}</th>
                ))}
                {entrantFiles && <th>Largest size</th>}
              </tr>
            </thead>
            <tbody>
              {spec.rows.map((row) => {
                const setCell = (column: string, cell: string | null) =>
                  patch('Runs', {
                    rows: spec.rows.map((item) =>
                      item.id === row.id
                        ? { ...item, cells: { ...item.cells, [column]: cell } }
                        : item,
                    ),
                  });
                return (
                  <tr key={row.id}>
                    <th>
                      <TextInput
                        label={`Title of ${row.title}`}
                        labelHidden
                        value={row.title}
                        onChange={(title) =>
                          patch('Run titles', {
                            rows: spec.rows.map((item) =>
                              item.id === row.id ? { ...item, title } : item,
                            ),
                          })
                        }
                      />
                    </th>
                    {perRun.map((column) => (
                      <td key={column.id}>
                        {column.mode === 'entrant per run' ? (
                          <BodyText size="sm">The entrant gives it</BodyText>
                        ) : BY_FILE.has(column.type) ? (
                          <FileCell
                            name={row.cells[column.id] ?? null}
                            label={`${row.title} ${column.id}`}
                            onFile={(name) => setCell(column.id, name)}
                            onClear={() => setCell(column.id, null)}
                          />
                        ) : (
                          <TextInput
                            label={`${row.title} ${column.id}`}
                            labelHidden
                            value={row.cells[column.id] ?? ''}
                            onChange={(cell) => setCell(column.id, cell)}
                          />
                        )}
                      </td>
                    ))}
                    {entrantFiles && (
                      <td>
                        <div className={classes.narrow}>
                          <TextInput
                            label={`Largest size for ${row.title}`}
                            labelHidden
                            value={row.maxSize}
                            onChange={(maxSize) =>
                              patch('Runs', {
                                rows: spec.rows.map((item) =>
                                  item.id === row.id ? { ...item, maxSize } : item,
                                ),
                              })
                            }
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <BodyText>
            {spec.rows.length === 1
              ? 'This makes 1 run.'
              : `This makes ${String(spec.rows.length)} runs.`}
          </BodyText>
          <div>
            <Button
              variant="secondary"
              onClick={() =>
                patch('Runs', {
                  rows: [
                    ...spec.rows,
                    run(
                      `row-${String(spec.rows.length + 1)}`,
                      `Run ${String(spec.rows.length + 1)}`,
                      {},
                    ),
                  ],
                })
              }
            >
              Add a run
            </Button>
          </div>
          <CardPart
            title="What the entrant sees"
            line="The submit form, from the inputs the entrant gives."
          >
            <Preview spec={spec} />
          </CardPart>
        </BuildCard>

        <BuildCard
          id="scoring"
          title="Scoring"
          line="How one submission becomes its result: what it gives, the groups of its runs, and the result's fields, each worked out by its own line."
        >
          <CardPart
            title="What one submission gives"
            line="It runs once on each test, and each run gives a row. The numbers here are made up, to show the shape."
          >
            <RawData spec={spec} />
          </CardPart>
          <CardPart
            title="Groups"
            line="Named sets of runs, which every field can use. Click a dot to put a run in a group or take it out."
          >
            <RunsTable
              spec={spec}
              bare
              pointed={chosenGroup === undefined ? {} : { group: chosenGroup }}
              onGroups={(groups) => patch('Groups', { groups })}
            />
            <div className={task.statusLine}>
              <Button
                variant="secondary"
                onClick={() => {
                  const key = `g${String(Date.now())}`;
                  patch('Groups', {
                    groups: [
                      ...spec.groups,
                      {
                        key,
                        name: `group_${String(spec.groups.length + 1)}`,
                        runs: [],
                      },
                    ],
                  });
                  setChosen(`g:${key}`);
                }}
              >
                Add a group
              </Button>
            </div>
          </CardPart>
          <CardPart
            title="The whole result"
            line="Every field below, joined up: a wire is a field reading a group or another field. Click a field to change its line here, or change it in its own card."
          >
            <BoxGraph
              boxes={graph.boxes}
              wires={graph.wires}
              selected={chosen}
              onSelect={setChosen}
              shape={SCORING}
              labels={false}
              inside={(box) =>
                box.id === chosen && chosenValue !== undefined ? (
                  <FormulaLine
                    key={chosenValue.key}
                    label={chosenValue.name}
                    scope={scope}
                    value={chosenValue.text}
                    placeholder="Type, or click a tile below"
                    autoFocus
                    onFocusLine={(insert) =>
                      target.focus(chosenValue.name, insert, 'graph')
                    }
                    onChange={(text) => setText(chosenValue.key, text)}
                  />
                ) : null
              }
            />
            {chosenValue !== undefined && target.place === 'graph' && (
              <FormulaTiles
                scope={scope}
                target={target.target}
                onInsert={target.insert}
              />
            )}
            {chosen === 'result' && (
              <ResultTable
                spec={spec}
                readings={readings}
                onShow={(show) => patch('Show', { show })}
              />
            )}
          </CardPart>
          <CardPart
            title="Result fields"
            line="Each field is one number or piece of text in the result, worked out by its own line from the groups, the facts and other fields."
          >
            {spec.values.map((value) => (
              <FieldCard
                key={value.key}
                spec={spec}
                value={value}
                scope={scope}
                reading={readings[value.key]}
                trouble={troubles.get(value.key)}
                target={target}
                onName={(name) =>
                  patch(`Fields: ${value.name}`, {
                    values: spec.values.map((item) =>
                      item.key === value.key ? { ...item, name } : item,
                    ),
                  })
                }
                onText={(text) => setText(value.key, text)}
                onShow={(show) => patch('Show', { show })}
                onRemove={() => {
                  patch(`Fields: ${value.name}`, {
                    values: spec.values.filter((item) => item.key !== value.key),
                  });
                  if (chosen === `v:${value.key}`) setChosen(null);
                }}
              />
            ))}
            <div className={task.statusLine}>
              <Button
                variant="secondary"
                onClick={() =>
                  patch('Fields', {
                    values: [
                      ...spec.values,
                      {
                        key: `v${String(Date.now())}`,
                        name: `field_${String(spec.values.length + 1)}`,
                        text: '',
                      },
                    ],
                  })
                }
              >
                Add a field
              </Button>
            </div>
          </CardPart>
        </BuildCard>

        <BuildCard
          id="checks"
          title="Checks"
          line="A made-up submission, and what it should get. Every save runs them; one that fails stops the save."
        >
          {spec.checks.map((check) => (
            <CheckCard
              key={check.id}
              check={check}
              spec={spec}
              onChange={(next) => patchCheck(check.id, next)}
              onRemove={() =>
                patch('Checks', {
                  checks: spec.checks.filter((item) => item.id !== check.id),
                })
              }
            />
          ))}
          <div>
            <Button
              variant="secondary"
              onClick={() =>
                patch('Checks', {
                  checks: [
                    ...spec.checks,
                    {
                      id: `c${String(Date.now())}`,
                      title: `Check ${String(spec.checks.length + 1)}`,
                      given: {},
                      expect: 'verdict',
                      verdict: 'accepted',
                      value: spec.values[0]?.name ?? '',
                      number: '',
                      passed: false,
                    },
                  ],
                })
              }
            >
              Add a check
            </Button>
          </div>
        </BuildCard>

        <BuildCard id="statement" title="Statement" line="What entrants read.">
          <Textarea
            label="Statement"
            value={spec.statement}
            rows={6}
            onChange={(statement) => patch('Statement', { statement })}
          />
        </BuildCard>
      </div>
      <SaveBar
        lines={saving.stage === 'checking' ? [] : lines}
        notices={
          regrades.length > 0 && saving.stage !== 'checking'
            ? [
                reruns
                  ? `This save runs every run of all ${String(SUBMISSIONS)} submissions again. It asks first.`
                  : `This save works the values out again for all ${String(SUBMISSIONS)} submissions; nothing runs again. It asks first.`,
              ]
            : []
        }
        problems={problems}
        state={{ stage: 'idle' }}
        asking={false}
        pinned={false}
        onSave={() => setSaving({ stage: regrades.length > 0 ? 'asking' : 'checking' })}
        onDiscard={() => {
          setLines([]);
          setSaving({ stage: 'idle' });
          onDiscard();
        }}
        onClose={() => setSaving({ stage: 'idle' })}
      >
        {saving.stage === 'checking' ? (
          <BodyText>
            Version {PUBLISHED + 1} is saved and checking: running {spec.checks.length}{' '}
            {spec.checks.length === 1 ? 'check' : 'checks'}. Entrants stay on version{' '}
            {PUBLISHED} until they pass.
          </BodyText>
        ) : saving.stage === 'done' ? (
          saving.answer
        ) : undefined}
      </SaveBar>
      <Modal
        opened={saving.stage === 'asking'}
        onClose={() => setSaving({ stage: 'idle' })}
        title="Save and regrade?"
      >
        <div className={classes.dialog}>
          <BodyText>
            {reruns
              ? `Every run of all ${String(SUBMISSIONS)} submissions runs again, on the new version.`
              : `The values are worked out again for all ${String(SUBMISSIONS)} submissions. No program runs again.`}
          </BodyText>
          <BodyText>What changed: {regrades.join(', ')}.</BodyText>
          <BodyText>
            Scores may change on the leaderboard Main while it regrades. Entrants see
            “being checked” until each is done.
          </BodyText>
          <div className={task.statusLine}>
            <Button onClick={() => setSaving({ stage: 'checking' })}>
              Save and regrade
            </Button>
            <Button variant="secondary" onClick={() => setSaving({ stage: 'idle' })}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        opened={moving !== null}
        onClose={() => setMoving(null)}
        title={`Move to ${moving ?? ''}?`}
      >
        <div className={classes.dialog}>
          {(moving === null ? [] : (spec.moves[moving] ?? [])).map((line) => (
            <BodyText key={line}>{line}</BodyText>
          ))}
          <BodyText tone="secondary">
            Nothing changes until you save; the save asks again.
          </BodyText>
          <div className={task.statusLine}>
            <Button
              onClick={() => {
                if (moving !== null) patch('Workflow', { version: moving });
                setMoving(null);
              }}
            >
              Move to {moving}
            </Button>
            <Button variant="secondary" onClick={() => setMoving(null)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function SetField({
  item,
  onChange,
}: {
  item: Input;
  onChange: (value: string) => void;
}) {
  if (BY_FILE.has(item.type))
    return (
      <div className={classes.narrow}>
        <FileCell
          name={item.value === '' ? null : item.value}
          label={item.id}
          onFile={onChange}
          onClear={() => onChange('')}
        />
      </div>
    );
  return (
    <div className={classes.narrow}>
      <TextInput
        label={item.unit === undefined ? 'Value' : `Value, in ${item.unit}`}
        value={item.value}
        onChange={onChange}
      />
    </div>
  );
}

function EntrantFields({
  item,
  onChange,
}: {
  item: Input;
  onChange: (next: Partial<Input>) => void;
}) {
  const field = (
    label: string,
    key: 'label' | 'maxSize' | 'choices' | 'least' | 'most' | 'start',
  ) => (
    <div className={classes.narrow}>
      <TextInput
        label={label}
        value={item[key]}
        onChange={(text) => onChange({ [key]: text })}
      />
    </div>
  );
  return (
    <div className={classes.switches}>
      {field('Label on the submit form', 'label')}
      {BY_FILE.has(item.type) && field('Largest size', 'maxSize')}
      {item.type === 'choice' && field('Choices, by commas', 'choices')}
      {item.type === 'number' && field('Least', 'least')}
      {item.type === 'number' && field('Most', 'most')}
      {!BY_FILE.has(item.type) && field('Starts at', 'start')}
    </div>
  );
}

/** What the runs table marks: a group, a column of each run. */
type Point = { group?: string; column?: string; value?: string };

/** Boxes a little narrower than a workflow's, so the whole flow fits the card. */
const SCORING: Shape = { width: 176, gap: 40, compact: false };

/**
 * The scoring as a flow, from one submission's runs to its result: each
 * group takes some runs, each value reads groups and other values, as its
 * formula says, and the result holds every value. Groups shown go in its
 * words, not as wires, which would loop under every column.
 */
function scoringGraph(
  spec: Spec,
  scope: FormulaScope,
  readings: Record<string, Reading | undefined>,
  troubles: Map<string, string>,
  chosen: string | null,
): { boxes: GraphBox[]; wires: GraphWire[] } {
  const titles = new Map(spec.rows.map((row) => [row.id, row.title]));
  const groups = [
    ...spec.groups.map((group) => ({ id: `g:${group.key}`, ...group })),
    { id: 'g:all', name: 'all', runs: spec.rows.map((row) => row.id) },
  ];
  const ids = new Map([
    ...groups.map((group): [string, string] => [group.name, group.id]),
    ...spec.values.map((value): [string, string] => [value.name, `v:${value.key}`]),
  ]);
  const boxes: GraphBox[] = [
    {
      id: 'runs',
      title: 'Runs',
      role: 'input',
      kind: `${String(spec.rows.length)} runs`,
      description: `Each gives ${spec.gives.map((give) => give.name).join(', ')}`,
      stacked: true,
      ports: [{ name: 'runs', side: 'out' }],
    },
  ];
  const wires: GraphWire[] = [];
  for (const group of groups) {
    boxes.push({
      id: group.id,
      title: group.name,
      kind: 'group',
      description:
        group.runs.length === 0
          ? 'No runs yet'
          : group.runs.map((id) => titles.get(id) ?? id).join(', '),
      stacked: true,
      ports: [
        { name: 'runs', side: 'in' },
        { name: group.name, side: 'out' },
      ],
    });
    wires.push({ from: 'runs', fromPort: 'runs', to: group.id, toPort: 'runs' });
  }
  for (const value of spec.values) {
    const id = `v:${value.key}`;
    const reading = readings[value.key];
    const node = reading?.node ?? null;
    const sources = sourcesOf(node, new Set(ids.keys()));
    const problem =
      troubles.get(value.key) ??
      reading?.unread?.message ??
      reading?.problems[0]?.message;
    const own = { ...scope, names: scope.names.filter((name) => name !== value.name) };
    // Open, it holds its formula, which says in words what it means and
    // what is wrong with it.
    const open = chosen === id;
    boxes.push({
      id,
      title: value.name,
      wide: 380,
      // After the groups, even before its formula reads one.
      least: 2,
      kind:
        problem === undefined &&
        (reading?.kind === 'number' || reading?.kind === 'text')
          ? reading.kind
          : 'to fix',
      description: open
        ? 'Worked out as:'
        : node === null
          ? value.text === ''
            ? 'No formula yet'
            : value.text
          : describeFormula(node, own),
      warn: open ? undefined : problem,
      ports: [
        ...sources.map((name): GraphPort => ({ name, side: 'in' })),
        { name: value.name, side: 'out' },
      ],
    });
    for (const name of sources) {
      const from = ids.get(name);
      if (from !== undefined)
        wires.push({ from, fromPort: name, to: id, toPort: name });
    }
  }
  const groupsShown = groups
    .filter((group) => (spec.show[group.name] ?? 'never') !== 'never')
    .map((group) => group.name);
  boxes.push({
    id: 'result',
    title: 'Result',
    role: 'output',
    kind: 'what it gets',
    description: [
      `${String(spec.values.length)} values`,
      groupsShown.length === 0 ? null : `the runs of ${groupsShown.join(', ')}`,
      `${String(spec.folders.length)} folders`,
    ]
      .filter((part) => part !== null)
      .join(', '),
    ports: spec.values.map((value): GraphPort => ({ name: value.name, side: 'in' })),
  });
  for (const value of spec.values)
    wires.push({
      from: `v:${value.key}`,
      fromPort: value.name,
      to: 'result',
      toPort: value.name,
    });
  return { boxes, wires };
}

/**
 * What a task's values can read, and which values are text. A value is text
 * when its formula gives text, and one value can read another, so this goes
 * round until nothing more turns out to be text.
 */
function scopeOf(spec: Spec): FormulaScope {
  const sets = [...spec.groups.map((group) => group.name), 'all'];
  const base: FormulaScope = {
    where: 'task',
    names: [
      ...spec.values.map((value) => value.name),
      ...spec.facts.map((f) => f.name),
    ],
    sets,
    each: sets.flatMap((set) => spec.gives.map((give) => `${set}.${give.name}`)),
    fields: Object.fromEntries(
      spec.gives.map((give) => [give.name, give.number ? 'number' : 'text']),
    ),
    about: Object.fromEntries([
      ...spec.values.map((value) => [value.name, `A value: ${value.text}`]),
      ...spec.facts.map((fact) => [fact.name, fact.line]),
      ...spec.groups.map((group) => [
        group.name,
        `${String(group.runs.length)} ${group.runs.length === 1 ? 'run' : 'runs'}`,
      ]),
      ['all', 'Every run'],
      ...sets.flatMap((set) =>
        spec.gives.map((give) => [
          `${set}.${give.name}`,
          `For each run in ${set}: ${give.line}`,
        ]),
      ),
    ]) as Record<string, string>,
  };
  const runTexts = sets.flatMap((set) =>
    spec.gives.filter((give) => !give.number).map((give) => `${set}.${give.name}`),
  );
  let texts: string[] = [];
  for (let round = 0; round <= spec.values.length; round += 1) {
    const scope = { ...base, texts: [...runTexts, ...texts] };
    const next = spec.values
      .filter((value) => readLine(value.text, scope).kind === 'text')
      .map((value) => value.name);
    if (next.join() === texts.join()) break;
    texts = next;
  }
  return { ...base, texts: [...runTexts, ...texts] };
}

/** What a formula reads that has a box of its own: groups, fields and facts. */
function sourcesOf(node: FormulaNode | null, known: ReadonlySet<string>): string[] {
  if (node === null) return [];
  // A group's column reads the group.
  return [
    ...new Set(
      namesIn(node)
        .map((name) => (known.has(name) ? name : name.split('.')[0]))
        .filter((name): name is string => name !== undefined && known.has(name)),
    ),
  ];
}

/**
 * What is wrong with each field beyond its own line: a name something else
 * already has, or reading itself through other fields. Names are one
 * namespace, so two fields never combine into one result under one name.
 */
function troublesOf(
  spec: Spec,
  readings: Record<string, Reading | undefined>,
): Map<string, string> {
  const fields = new Set(spec.values.map((value) => value.name));
  const reads = new Map(
    spec.values.map((value) => [
      value.name,
      sourcesOf(readings[value.key]?.node ?? null, fields),
    ]),
  );
  const troubles = new Map<string, string>();
  for (const value of spec.values) {
    const twin = spec.values.some(
      (other) => other.key !== value.key && other.name === value.name,
    )
      ? 'another field'
      : spec.groups.some((group) => group.name === value.name) || value.name === 'all'
        ? 'a group'
        : spec.facts.some((fact) => fact.name === value.name)
          ? 'a fact'
          : null;
    if (twin !== null) {
      troubles.set(value.key, `${twin} is called ${value.name} too: rename one`);
      continue;
    }
    const loop = loopOf(value.name, reads);
    if (loop !== null)
      troubles.set(
        value.key,
        `reads itself, round ${loop.join(' → ')}: break the loop`,
      );
  }
  return troubles;
}

/** The fields a field reads round to itself, or null when it never does. */
function loopOf(name: string, reads: Map<string, string[]>): string[] | null {
  const seen = new Set<string>();
  const walk = (at: string, path: string[]): string[] | null => {
    for (const next of reads.get(at) ?? []) {
      if (next === name) return [...path, next];
      if (seen.has(next)) continue;
      seen.add(next);
      const found = walk(next, [...path, next]);
      if (found !== null) return found;
    }
    return null;
  };
  return walk(name, [name]);
}

/** Made-up numbers for a run, to show what a submission's rows look like. */
function exampleOf(give: Gives, index: number): string {
  const passed = index % 3 !== 2;
  if (give.name === 'passed') return passed ? '1' : '0';
  if (give.name === 'verdict') return passed ? 'OK' : 'WA';
  if (give.name === 'points') return passed ? '1' : '0';
  if (give.name === 'time_ms') return String([120, 95, 340, 880][index % 4]);
  return give.number ? '3' : '…';
}

/**
 * What one submission gives, read only: a row per run with what each run
 * gives, and the facts about the submission.
 */
function RawData({ spec }: { spec: Spec }) {
  const many = spec.rows.length > 5;
  const rows = many ? spec.rows.slice(0, 4) : spec.rows;
  return (
    <div className={classes.raw}>
      <div className={classes.rawSource}>
        <strong>One submission</strong>
        <span>What the entrant hands in</span>
      </div>
      <div className={classes.rawArrow}>
        <span>runs once on each test</span>
      </div>
      <div className={classes.rawRuns}>
        <div className={classes.scroll}>
          <table className={`${classes.table} ${classes.runsTable}`}>
            <thead>
              <tr>
                <th>Run</th>
                {spec.gives.map((give) => (
                  <th key={give.name} title={give.line}>
                    {give.name}
                    <span className={classes.colKind}>
                      {give.number ? 'number' : 'text'}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <th>{row.title}</th>
                  {spec.gives.map((give) => (
                    <td key={give.name} className={classes.muted}>
                      {exampleOf(give, index)}
                    </td>
                  ))}
                </tr>
              ))}
              {many && (
                <tr>
                  <th className={classes.muted} colSpan={spec.gives.length + 1}>
                    and {spec.rows.length - rows.length} more runs
                  </th>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className={classes.rawFacts}>
          And facts about the submission:{' '}
          {spec.facts.map((fact, index) => (
            <span key={fact.name} title={fact.line}>
              {index > 0 && ', '}
              <code>{fact.name}</code> 0
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}

/** One field's own small flow: what its line reads, wired into it. */
function fieldGraph(
  spec: Spec,
  value: Value,
  reading: Reading | undefined,
): { boxes: GraphBox[]; wires: GraphWire[] } {
  const titles = new Map(spec.rows.map((row) => [row.id, row.title]));
  const about = new Map<string, { kind: string; description: string }>([
    ...[...spec.groups, { name: 'all', runs: spec.rows.map((row) => row.id) }].map(
      (group): [string, { kind: string; description: string }] => [
        group.name,
        {
          kind: 'group',
          description: group.runs.map((id) => titles.get(id) ?? id).join(', '),
        },
      ],
    ),
    ...spec.values
      .filter((other) => other.key !== value.key)
      .map((other): [string, { kind: string; description: string }] => [
        other.name,
        { kind: 'field', description: other.text },
      ]),
    ...spec.facts.map((fact): [string, { kind: string; description: string }] => [
      fact.name,
      { kind: 'fact', description: fact.line },
    ]),
  ]);
  const sources = sourcesOf(reading?.node ?? null, new Set(about.keys()));
  return {
    boxes: [
      ...sources.map((name): GraphBox => ({
        id: name,
        title: name,
        role: 'input',
        kind: about.get(name)?.kind ?? '',
        description: about.get(name)?.description,
        ports: [{ name, side: 'out' }],
      })),
      {
        id: 'self',
        title: value.name,
        role: 'output',
        kind: 'field',
        ports: sources.map((name): GraphPort => ({ name, side: 'in' })),
      },
    ],
    wires: sources.map((name) => ({
      from: name,
      fromPort: name,
      to: 'self',
      toPort: name,
    })),
  };
}

/**
 * One result field, on its own: its name, when entrants see it, its small
 * flow, and its line. The tiles open under the line while it is the one
 * being written.
 */
function FieldCard({
  spec,
  value,
  scope,
  reading,
  trouble,
  target,
  onName,
  onText,
  onShow,
  onRemove,
}: {
  spec: Spec;
  value: Value;
  scope: FormulaScope;
  reading: Reading | undefined;
  trouble: string | undefined;
  target: ReturnType<typeof useFormulaTarget>;
  onName: (name: string) => void;
  onText: (text: string) => void;
  onShow: (show: Record<string, When>) => void;
  onRemove: () => void;
}) {
  const place = `card:${value.key}`;
  const flowOf = fieldGraph(spec, value, reading);
  const kind =
    trouble === undefined &&
    reading?.unread === null &&
    reading.problems.length === 0 &&
    (reading.kind === 'number' || reading.kind === 'text')
      ? reading.kind
      : 'to fix';
  return (
    <section className={classes.field}>
      <div className={classes.valueHead}>
        <div className={classes.nameCell}>
          <TextInput label="Name" value={value.name} onChange={onName} />
        </div>
        <WhenSelect spec={spec} id={value.name} labelled onChange={onShow} />
        <Chip tone={kind === 'to fix' ? 'warn' : 'quiet'}>{kind}</Chip>
        <span className={classes.fieldGap} />
        <Button size="xs" variant="secondary" onClick={onRemove}>
          Remove
        </Button>
      </div>
      {flowOf.boxes.length > 1 && (
        <BoxGraph
          boxes={flowOf.boxes}
          wires={flowOf.wires}
          selected={null}
          onSelect={() => undefined}
          shape={SMALL}
          labels={false}
          floor={0}
        />
      )}
      <FormulaLine
        label={value.name}
        scope={scope}
        value={value.text}
        autoFocus={value.text === ''}
        placeholder="Type, or click a tile below"
        onFocusLine={(insert) => target.focus(value.name, insert, place)}
        onChange={onText}
      />
      {trouble !== undefined && <p className={classes.formulaProblems}>{trouble}</p>}
      {target.place === place && (
        <FormulaTiles scope={scope} target={target.target} onInsert={target.insert} />
      )}
    </section>
  );
}

/** Every part of a result, and when entrants see it. */
function ResultTable({
  spec,
  readings,
  onShow,
}: {
  spec: Spec;
  readings: Record<string, Reading | undefined>;
  onShow: (show: Record<string, When>) => void;
}) {
  const sets = [...spec.groups.map((group) => group.name), 'all'];
  return (
    <table className={classes.table}>
      <thead>
        <tr>
          <th>Name</th>
          <th>What it is</th>
          <th>Shown</th>
        </tr>
      </thead>
      <tbody>
        {[
          ...spec.values.map((value) => {
            const kind = readings[value.key]?.kind;
            return {
              id: value.name,
              what:
                kind === 'number' || kind === 'text'
                  ? `A field: ${kind}`
                  : 'A field, still to fix',
            };
          }),
          ...sets.map((name) => ({
            id: name,
            what: `Its runs, each with ${spec.gives.map((give) => give.name).join(', ')}`,
          })),
          ...spec.folders.map((folder) => ({
            id: folder.name,
            what: `${folder.line}, to download`,
          })),
        ].map((item) => (
          <tr key={item.id}>
            <th>
              <code>{item.id}</code>
            </th>
            <td>{item.what}</td>
            <td>
              <WhenSelect spec={spec} id={item.id} onChange={onShow} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The raw runs: each run's inputs, what it gives, and the groups it is in. */
function RunsTable({
  spec,
  pointed,
  onGroups,
  bare = false,
}: {
  spec: Spec;
  pointed: Point;
  onGroups: (groups: Group[]) => void;
  /** Only each run's title and its groups, where its data is shown above. */
  bare?: boolean;
}) {
  const inputs = bare ? [] : spec.inputs.filter((each) => PER_RUN.has(each.mode));
  const gives = bare ? [] : spec.gives;
  const inGroup = (row: Run) =>
    pointed.group === undefined ||
    pointed.group === 'all' ||
    spec.groups.some(
      (group) => group.name === pointed.group && group.runs.includes(row.id),
    );
  return (
    <div className={classes.scroll}>
      <table className={`${classes.table} ${classes.runsTable}`}>
        <thead>
          <tr>
            <th />
            {inputs.length > 0 && <th colSpan={inputs.length}>Its inputs</th>}
            {gives.length > 0 && <th colSpan={gives.length}>What it gives</th>}
            <th colSpan={spec.groups.length + 1}>In the groups</th>
          </tr>
          <tr>
            <th>Run</th>
            {inputs.map((each) => (
              <th key={each.id}>
                {each.id}
                <span className={classes.colKind}>{each.type}</span>
              </th>
            ))}
            {gives.map((give) => (
              <th
                key={give.name}
                title={give.line}
                data-pointed={pointed.column === give.name || undefined}
              >
                {give.name}
                <span className={classes.colKind}>
                  {give.number ? 'number' : 'text'}
                </span>
              </th>
            ))}
            {spec.groups.map((group) => (
              <th
                key={group.key}
                data-pointed={pointed.group === group.name || undefined}
              >
                <div className={classes.groupHead}>
                  <TextInput
                    label={`Name of the group ${group.name}`}
                    labelHidden
                    value={group.name}
                    onChange={(name) =>
                      onGroups(
                        spec.groups.map((item) =>
                          item.key === group.key ? { ...item, name } : item,
                        ),
                      )
                    }
                  />
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() =>
                      onGroups(spec.groups.filter((item) => item.key !== group.key))
                    }
                  >
                    Remove
                  </Button>
                </div>
              </th>
            ))}
            <th data-pointed={pointed.group === 'all' || undefined}>
              all
              <span className={classes.colKind}>built in</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {spec.rows.map((row) => (
            <tr
              key={row.id}
              data-in={(pointed.group !== undefined && inGroup(row)) || undefined}
            >
              <th>{row.title}</th>
              {inputs.map((each) => (
                <td key={each.id} className={classes.muted}>
                  {each.mode === 'entrant per run'
                    ? 'the entrant’s'
                    : (row.cells[each.id] ?? '—')}
                </td>
              ))}
              {gives.map((give) => (
                <td
                  key={give.name}
                  className={classes.muted}
                  data-pointed={
                    (pointed.column === give.name && inGroup(row)) || undefined
                  }
                >
                  {give.number ? 'a number' : 'text'}
                </td>
              ))}
              {spec.groups.map((group) => {
                const inside = group.runs.includes(row.id);
                return (
                  <td
                    key={group.key}
                    data-pointed={pointed.group === group.name || undefined}
                  >
                    <button
                      type="button"
                      className={classes.member}
                      aria-pressed={inside}
                      aria-label={`${row.title} in ${group.name}`}
                      onClick={() =>
                        onGroups(
                          spec.groups.map((item) =>
                            item.key === group.key
                              ? {
                                  ...item,
                                  runs: inside
                                    ? item.runs.filter((id) => id !== row.id)
                                    : [...item.runs, row.id],
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      <span
                        className={classes.memberDot}
                        data-on={inside || undefined}
                      />
                    </button>
                  </td>
                );
              })}
              <td data-pointed={pointed.group === 'all' || undefined}>
                <span className={classes.member}>
                  <span className={classes.memberDot} data-on />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** When entrants see one part of the result. */
function WhenSelect({
  spec,
  id,
  labelled = false,
  onChange,
}: {
  spec: Spec;
  id: string;
  /** Says "Shown to entrants" above it, where no table heading does. */
  labelled?: boolean;
  onChange: (show: Record<string, When>) => void;
}) {
  // The contest is open, so what the published version shows now has been seen.
  const seen = spec.shown[id] === 'now';
  return (
    <div className={classes.whenCell}>
      <Select
        label={labelled ? 'Shown to entrants' : `When ${id} is shown`}
        labelHidden={!labelled}
        value={spec.show[id] ?? 'never'}
        options={WHEN.map((when, index) => ({
          value: when.value,
          label:
            seen && index > 0 ? `${when.label}: no, entrants have seen it` : when.label,
          disabled: seen && index > 0,
        }))}
        onChange={(when) => onChange({ ...spec.show, [id]: when as When })}
      />
    </div>
  );
}

function CheckCard({
  check,
  spec,
  onChange,
  onRemove,
}: {
  check: Check;
  spec: Spec;
  onChange: (next: Partial<Check>) => void;
  onRemove: () => void;
}) {
  const give = (key: string, text: string) =>
    onChange({ given: { ...check.given, [key]: text } });
  return (
    <div className={task.item}>
      <div className={task.itemHead}>
        <div className={classes.narrow}>
          <TextInput
            label="Title"
            value={check.title}
            onChange={(title) => onChange({ title })}
          />
        </div>
        {check.passed ? (
          <Chip tone="live">Passed on version {PUBLISHED}</Chip>
        ) : (
          <Chip tone="quiet">Runs on the next save</Chip>
        )}
      </div>
      <p className={classes.groupTitle}>The made-up submission</p>
      <div className={classes.switches}>
        {spec.inputs
          .filter((each) => each.mode === 'entrant')
          .map((each) =>
            each.type === 'choice' ? (
              <div key={each.id} className={classes.switch}>
                <Select
                  label={each.label === '' ? each.id : each.label}
                  value={check.given[each.id] ?? ''}
                  placeholder="Choose"
                  options={each.choices
                    .split(',')
                    .map((choice) => choice.trim())
                    .filter((choice) => choice !== '')
                    .map((choice) => ({ value: choice, label: choice }))}
                  onChange={(text) => give(each.id, text)}
                />
              </div>
            ) : BY_FILE.has(each.type) ? (
              <div key={each.id} className={classes.switch}>
                <FileCell
                  name={check.given[each.id] ?? null}
                  label={each.label === '' ? each.id : each.label}
                  onFile={(name) => give(each.id, name)}
                  onClear={() => give(each.id, '')}
                />
              </div>
            ) : (
              <div key={each.id} className={classes.switch}>
                <TextInput
                  label={each.label === '' ? each.id : each.label}
                  value={check.given[each.id] ?? ''}
                  onChange={(text) => give(each.id, text)}
                />
              </div>
            ),
          )}
        {spec.inputs
          .filter((each) => each.mode === 'entrant per run')
          .flatMap((each) =>
            spec.rows.map((row) => (
              <div key={`${each.id}:${row.id}`} className={classes.switch}>
                <BodyText size="sm">
                  {each.label === '' ? each.id : each.label}, {row.title}
                </BodyText>
                <FileCell
                  name={check.given[`${each.id}:${row.id}`] ?? null}
                  label={`${each.id} for ${row.title}`}
                  onFile={(name) => give(`${each.id}:${row.id}`, name)}
                  onClear={() => give(`${each.id}:${row.id}`, '')}
                />
              </div>
            )),
          )}
      </div>
      <div className={classes.switches}>
        <div className={classes.switch}>
          <Select
            label="It should get"
            value={check.expect}
            options={[
              { value: 'verdict', label: 'A verdict on every run' },
              { value: 'value', label: 'A value' },
            ]}
            onChange={(expect) => onChange({ expect: expect as Check['expect'] })}
          />
        </div>
        {check.expect === 'verdict' ? (
          <div className={classes.switch}>
            <Select
              label="Verdict"
              value={check.verdict}
              options={VERDICTS.map((verdict) => ({ value: verdict, label: verdict }))}
              onChange={(verdict) => onChange({ verdict })}
            />
          </div>
        ) : (
          <>
            <div className={classes.switch}>
              <Select
                label="Value"
                value={check.value}
                options={spec.values.map((value) => ({
                  value: value.name,
                  label: value.name,
                }))}
                onChange={(value) => onChange({ value })}
              />
            </div>
            <div className={classes.narrow}>
              <TextInput
                label="Should be"
                value={check.number}
                onChange={(number) => onChange({ number })}
              />
            </div>
          </>
        )}
      </div>
      <div>
        <Button size="xs" variant="secondary" onClick={onRemove}>
          Remove this check
        </Button>
      </div>
    </div>
  );
}

function FileCell({
  name,
  label,
  onFile,
  onClear,
}: {
  name: string | null;
  label: string;
  onFile: (name: string) => void;
  onClear: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const take = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file !== undefined) onFile(file.name);
  };
  const present = name !== null && name !== '';
  return (
    <div>
      <label
        className={classes.cell}
        data-dragging={dragging || undefined}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={take}
      >
        <span className={classes.cellName}>{present ? name : 'Drop or pick'}</span>
        <span className={classes.cellHint}>
          {present ? 'Drop another to replace it' : 'A file for this cell'}
        </span>
        <input
          className={classes.cellInput}
          type="file"
          aria-label={label}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file !== undefined) onFile(file.name);
            event.currentTarget.value = '';
          }}
        />
      </label>
      {present && (
        <Button size="xs" variant="secondary" onClick={onClear}>
          Remove
        </Button>
      )}
    </div>
  );
}

/** The submit form, drawn from the inputs the entrant gives. */
function Preview({ spec }: { spec: Spec }) {
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const drop = (key: string, label: string, size: string) => (
    <FileDrop
      key={key}
      label={label}
      description={size === '' ? undefined : `At most ${size}.`}
      files={files[key] ?? []}
      onChange={(next) => setFiles((curr) => ({ ...curr, [key]: next }))}
    />
  );
  const fields = spec.inputs.flatMap((each) => {
    const label = each.label === '' ? each.id : each.label;
    if (each.mode === 'entrant per run')
      return spec.rows.map((row) =>
        drop(`${each.id}:${row.id}`, `${label}: ${row.title}`, row.maxSize),
      );
    if (each.mode !== 'entrant') return [];
    if (BY_FILE.has(each.type)) return [drop(each.id, label, each.maxSize)];
    if (each.type === 'choice') {
      const choices = each.choices
        .split(',')
        .map((choice) => choice.trim())
        .filter((choice) => choice !== '');
      return [
        <Select
          key={each.id}
          label={label}
          value={each.start}
          options={choices.map((choice) => ({ value: choice, label: choice }))}
          onChange={() => undefined}
        />,
      ];
    }
    return [
      <TextInput
        key={each.id}
        label={label}
        value={each.start}
        onChange={() => undefined}
      />,
    ];
  });
  return (
    <div className={classes.preview}>
      {fields.length === 0 ? (
        <BodyText size="sm" tone="secondary">
          The entrant gives nothing, so there is no form.
        </BodyText>
      ) : (
        fields
      )}
    </div>
  );
}
