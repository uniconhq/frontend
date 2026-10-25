import { useState } from 'react';
import { $api } from '@/api/query';
import { BodyText } from '@/ui/BodyText';
import { Page, PageHeader } from '@/ui/Page';
import { Select } from '@/ui/Select';
import { FormulaLine, FormulaTiles } from '../formula/Editor';
import type { FormulaScope } from '../formula/parse';
import { useFormulaTarget } from '../formula/target';
import { MockLinks } from './MockLinks';
import classes from './stage6.module.css';

const TASK_SCOPE: FormulaScope = {
  where: 'task',
  names: [
    'sample_score',
    'sample_time',
    'st1',
    'st2',
    'total',
    'first_failed',
    'seconds_late',
    'a_win',
    'a_win.attempt',
    'a_minute',
  ],
  sets: ['sample_tests', 'st1_tests', 'st2_tests', 'all', 'a'],
  each: [
    'sample_tests.passed',
    'sample_tests.time_ms',
    'st1_tests.passed',
    'st2_tests.passed',
    'all.passed',
    'all.points',
    'all.verdict',
    'a.compiled',
    'a.solved',
    'a.attempt',
  ],
  texts: ['first_failed', 'all.verdict'],
  fields: { passed: 'number', verdict: 'text', points: 'number', time_ms: 'number' },
  about: {
    sample_score: 'How many sample runs passed',
    sample_time: 'The slowest sample run, in ms',
    st1: '1 when every subtask 1 run passed, else 0',
    st2: '1 when every subtask 2 run passed, else 0',
    total: "The task's score, out of 100",
    first_failed: "Text: the first failed run's verdict, or none",
    seconds_late: 'A fact: how many seconds after the due time it came in',
    sample_tests: 'The 2 sample runs',
    st1_tests: 'The 1 run of subtask 1',
    st2_tests: 'The 2 runs of subtask 2',
    all: 'Every run',
    'sample_tests.passed': 'For each sample run: 1 if it was accepted, else 0',
    'sample_tests.time_ms': 'For each sample run: how long it ran, in ms',
    'st1_tests.passed': 'For each subtask 1 run: 1 if it was accepted, else 0',
    'st2_tests.passed': 'For each subtask 2 run: 1 if it was accepted, else 0',
    'all.passed': 'For each run: 1 if it was accepted, else 0',
    'all.points': 'For each run: the points its checker gave',
    'all.verdict': 'For each run: its verdict, as text, such as OK or WA',
  },
};

const LEADERBOARD_SCOPE: FormulaScope = {
  where: 'leaderboard',
  names: ['score', 'islands_last', 'islands_last.total', 'gradebook.total'],
  sets: ['islands', 'tour'],
  each: ['islands.total', 'islands.st1', 'tour.score'],
  fields: { total: 'number', st1: 'number', first_failed: 'text' },
  about: {
    score: "This leaderboard's score column",
    islands_last: "A pick column: each entrant's latest islands submission",
    'islands_last.total': "The total of each entrant's latest islands submission",
    'gradebook.total': "The gradebook leaderboard's total column",
    islands: 'The islands task',
    tour: 'The tour task',
    'islands.total': 'For each islands submission: its total, out of 100',
    'islands.st1': 'For each islands submission: its st1',
    'tour.score': 'For each tour submission: its score',
  },
};

const TASKS = [
  { id: 'total', label: 'total', result: 'total', text: '40 * st1 + 60 * st2' },
  { id: 'st1', label: 'st1', result: 'st1', text: 'min(st1_tests.passed)' },
  {
    id: 'sample_time',
    label: 'sample_time',
    result: 'sample_time',
    text: 'max(sample_tests.time_ms)',
  },
  {
    id: 'share',
    label: 'Share passed',
    result: 'share',
    text: 'sum(all.passed) / count(all)',
  },
  {
    id: 'late',
    label: 'Late penalty',
    result: 'late_total',
    text: 'if(seconds_late > 0, total * 9 / 10, total)',
  },
  {
    id: 'problems',
    label: 'With mistakes',
    result: 'sample_score',
    text: 'sum(sample_tests.passed, st1) + mystery + sample_tests.time_ms + count(st1) + first(all)',
  },
  {
    id: 'first_failed',
    label: 'first_failed (text)',
    result: 'first_failed',
    text: 'otherwise(first(all, all.passed == 0).verdict, "none")',
  },
  {
    id: 'fastest',
    label: 'Fastest sample run',
    result: 'fastest',
    text: 'lowest(sample_tests, sample_tests.time_ms).time_ms',
  },
  {
    id: 'a_tries',
    label: 'a_tries (ICPC)',
    result: 'a_tries',
    text: 'count(a, a.compiled == 1 and a.solved == 0 and otherwise(a.attempt < a_win.attempt, 1))',
  },
];

const COLUMNS = [
  {
    id: 'score',
    label: 'score',
    result: 'score',
    text: '0.4 * max(islands.total) + 0.6 * max(tour.score)',
  },
  {
    id: 'islands_last',
    label: 'islands_last (a pick)',
    result: 'islands_last',
    text: 'latest(islands)',
  },
  {
    id: 'solved',
    label: 'Solved islands',
    result: 'solved',
    text: 'if(islands_last, islands_last.total, 0)',
  },
  {
    id: 'best',
    label: 'Best islands total',
    result: 'best',
    text: 'highest(islands, islands.total).total',
  },
  {
    id: 'column-problems',
    label: 'With mistakes',
    result: 'score',
    text: 'islands + count(tour.score) + latest(tour) * 2',
  },
];

/**
 * The formula editor in the two places it is used: a task's values and a
 * leaderboard's columns. Nothing is saved.
 */
export function FormulaPage() {
  const blocks = $api.useQuery('get', '/api/v1/blocks');
  const [where, setWhere] = useState<'task' | 'leaderboard'>('task');
  const examples = where === 'task' ? TASKS : COLUMNS;
  const [pick, setPick] = useState(TASKS[0]?.id ?? 'total');
  const [texts, setTexts] = useState<Record<string, string>>({});
  const line = useFormulaTarget();
  const example = examples.find((item) => item.id === pick) ?? examples[0];
  if (example === undefined) return null;
  const scope = where === 'task' ? TASK_SCOPE : LEADERBOARD_SCOPE;
  const catalogue = blocks.data;

  return (
    <Page label="Formula">
      <PageHeader title="Formula" links={<MockLinks />}>
        <BodyText>
          One value of a result, on its own. A result has many, one row each: see
          Scoring on the task page. Type, or click a tile; what fits pops up as you
          type, and the line below says what the formula means.
        </BodyText>
      </PageHeader>
      <div className={classes.switches}>
        <div className={classes.switch}>
          <Select
            label="Where"
            value={where}
            options={[
              { value: 'task', label: "A task's scoring values" },
              { value: 'leaderboard', label: "A leaderboard's columns" },
            ]}
            onChange={(value) => {
              const next = value === 'leaderboard' ? 'leaderboard' : 'task';
              setWhere(next);
              setPick((next === 'task' ? TASKS : COLUMNS)[0]?.id ?? 'total');
            }}
          />
        </div>
        <div className={classes.switch}>
          <Select
            label="Example"
            value={example.id}
            options={examples.map((item) => ({ value: item.id, label: item.label }))}
            onChange={setPick}
          />
        </div>
      </div>
      {catalogue === undefined ? (
        <BodyText>
          {blocks.isError
            ? 'The blocks could not be loaded, so a formula cannot be checked.'
            : 'Loading the blocks.'}
        </BodyText>
      ) : (
        <>
          <FormulaTiles
            scope={scope}
            catalogue={catalogue}
            target={line.target}
            onInsert={line.insert}
          />
          <div className={classes.formulaLine}>
            <FormulaLine
              key={example.id}
              label={example.result}
              scope={scope}
              catalogue={catalogue}
              value={texts[example.id] ?? example.text}
              onChange={(text) => setTexts((curr) => ({ ...curr, [example.id]: text }))}
              onFocusLine={(insert) => line.focus(example.result, insert)}
            />
          </div>
        </>
      )}
    </Page>
  );
}
