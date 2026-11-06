import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@/test/user-event';
import { formatExact } from '@/lib/exact';
import { renderWithProviders } from '@/test/render';
import { grading } from '@/test/contestant';
import { RESULTS_AFTER } from '@/ui/number/words';
import { ScoredResult } from './ScoredResult';

/** One run of classic, accepted, with the outputs it reported. */
function run(reports: { title: string; unit: string | null; number: string }[]) {
  return {
    group: 'main',
    place: 1,
    id: null,
    dropped: false,
    tuples: [{ title: 'Small grid', key: {} }],
    verdict: 'accepted' as const,
    passed: 1,
    reports,
    texts: {},
    label: null,
    labelled: null,
    message: null,
  };
}

describe('a run’s values', () => {
  it('names each by its title and unit, its number exact', () => {
    renderWithProviders(
      <ScoredResult
        grading={grading({
          status: 'graded',
          runs: [
            run([
              { title: 'Run time', unit: 'ms', number: '28' },
              { title: 'Memory used', unit: 'KB', number: '10420' },
            ]),
          ],
          once: { reports: { time_ms: '3' }, texts: {} },
        })}
      />,
    );

    const group = screen.getByRole('region', { name: 'Group main' });
    expect(within(group).getByText(/Run time/)).toHaveTextContent('Run time (ms) 28');
    expect(within(group).getByText(/Memory used/)).toHaveTextContent(
      `Memory used (KB) ${formatExact('10420')}`,
    );
    expect(screen.getByLabelText('Once')).toHaveTextContent('time_ms3');
  });

  it('says nothing while a submission still waits for its grading', () => {
    renderWithProviders(<ScoredResult grading={grading({ status: 'queued' })} />);
    expect(screen.queryByText(RESULTS_AFTER)).toBeNull();
    expect(screen.queryByLabelText('Values')).toBeNull();
  });
});

describe('a run task’s result', () => {
  it('shows values and each run by its titles, with no penalty', () => {
    renderWithProviders(
      <ScoredResult
        grading={grading({
          status: 'graded',
          run_values: [
            {
              name: 'score',
              number: '10',
              text: null,
              waiting: false,
              self_reported: true,
              show: 'always',
              facts: null,
              runs: null,
              values: null,
            },
          ],
          runs: [
            {
              group: 'samples',
              place: 1,
              id: null,
              dropped: false,
              tuples: [
                { title: 'Big grid', key: { grid: 'big.txt' } },
                { title: null, key: { seed: 2 } },
              ],
              verdict: 'skipped',
              passed: 0,
              reports: [],
              texts: {},
              label: null,
              labelled: null,
              message: null,
            },
          ],
        })}
      />,
    );

    expect(screen.getByRole('region', { name: 'Group samples' })).toHaveTextContent(
      'Test 1',
    );
    expect(screen.getByText('Big grid · seed 2')).toBeVisible();
    expect(screen.getByText('NOT GIVEN')).toBeVisible();
    expect(screen.getByText('score').closest('div')).toHaveTextContent('10');
    expect(screen.queryByText(/penal/)).toBeNull();
    expect(screen.queryByText(/self-reported/)).toBeNull();
  });

  it('says nothing is shown yet, and when it will be', () => {
    renderWithProviders(
      <ScoredResult
        grading={grading({
          status: 'submitted',
          reveal_at: '2026-09-29T12:00:00Z',
        })}
      />,
    );
    expect(screen.getByText(RESULTS_AFTER)).toBeVisible();
    expect(screen.getByText(/Results at /)).toBeVisible();
  });

  it('reads a text when it is opened', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ScoredResult
        grading={grading({
          status: 'graded',
          once: { reports: {}, texts: { log: { name: null, output: null } } },
          runs: [
            {
              group: 'samples',
              place: 1,
              id: null,
              dropped: false,
              tuples: [{ title: 'Small grid', key: {} }],
              verdict: 'accepted',
              passed: 1,
              reports: [],
              texts: {},
              label: null,
              labelled: null,
              message: null,
            },
          ],
        })}
        readText={(ask) => {
          expect(ask).toEqual({
            group: null,
            place: null,
            field: 'texts',
            name: 'log',
            output: null,
          });
          return Promise.resolve('Compiled cleanly.');
        }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Show log' }));
    expect(screen.getByLabelText('log')).toHaveTextContent('Compiled cleanly.');
  });

  it('shows when a value is shown, a dropped run and the facts', () => {
    renderWithProviders(
      <ScoredResult
        grading={{
          id: 'g',
          attempt: 1,
          status: 'done',
          reason: null,
          limit: null,
          once: { reports: {}, texts: {} },
          inputs: {},
          runs: [
            {
              group: 'all',
              place: 1,
              dropped: true,
              id: 'r',
              tuples: [{ title: 'Small grid', key: {} }],
              verdict: 'accepted',
              passed: 1,
              reports: [],
              texts: {},
              label: null,
              labelled: null,
              message: null,
            },
          ],
          run_values: [
            {
              name: 'score',
              number: '7.5',
              text: null,
              waiting: false,
              self_reported: false,
              show: 'after_release',
              facts: null,
              runs: null,
              values: null,
            },
          ],
          facts: { seconds_late: '0', seconds: '1.2' },
          compiled: 1,
        }}
      />,
    );
    expect(screen.getByText(/After release/)).toBeVisible();
    expect(screen.getByText('Dropped')).toBeVisible();
    expect(screen.getByText('Seconds late').closest('div')).toHaveTextContent('0');
    expect(screen.getByText('Whether it compiled').closest('div')).toHaveTextContent(
      'Yes',
    );
  });

  it('says no when it did not compile, and names a fact it does not know in words', () => {
    renderWithProviders(
      <ScoredResult
        grading={{
          id: 'g',
          attempt: 1,
          status: 'done',
          reason: null,
          limit: null,
          once: { reports: {}, texts: {} },
          inputs: {},
          runs: [],
          run_values: [],
          facts: { compiled: '0', first_failed: '3' },
          compiled: 0,
        }}
      />,
    );
    expect(screen.getByText('Whether it compiled').closest('div')).toHaveTextContent(
      'No',
    );
    expect(screen.getByText('First failed').closest('div')).toHaveTextContent('3');
    expect(screen.queryByText('compiled')).toBeNull();
    expect(screen.queryByText('first_failed')).toBeNull();
  });
});

describe('what an entry of show names', () => {
  it('says whether a run passed when its entry names passed alone', () => {
    renderWithProviders(
      <ScoredResult
        grading={grading({
          status: 'graded',
          runs: [
            { ...run([]), verdict: null, passed: 1 },
            { ...run([]), place: 2, verdict: null, passed: 0 },
          ],
        })}
      />,
    );
    const group = screen.getByRole('region', { name: 'Group main' });
    expect(group).toHaveTextContent('Test 1Small gridPassed');
    expect(group).toHaveTextContent('Test 2Small gridNot passed');
    expect(group).not.toHaveTextContent(/accepted/i);
  });

  it('shows a run with only the fields its entry names, and names the first run not passed by its own place', () => {
    renderWithProviders(
      <ScoredResult
        grading={grading({
          status: 'graded',
          runs: [
            {
              ...run([]),
              group: 'samples',
              tuples: [{ title: null, key: { seed: 2 } }],
              verdict: null,
              passed: null,
            },
            {
              ...run([]),
              group: 'first_not_passed',
              tuples: [{ title: null, key: {} }],
              verdict: 'wrong_answer',
              labelled: { group: 'big', place: 3 },
            },
          ],
        })}
      />,
    );
    const samples = screen.getByRole('region', { name: 'Group samples' });
    expect(samples).toHaveTextContent('Test 1seed 2');
    expect(samples).not.toHaveTextContent(/passed/i);
    expect(samples).not.toHaveTextContent(/accepted/i);
    const first = screen.getByRole('region', { name: 'Group First test not passed' });
    expect(first).toHaveTextContent('Test 3 of big');
    expect(first).toHaveTextContent(/wrong/i);
    expect(screen.queryByLabelText('Inputs')).toBeNull();
  });

  it('shows the settings it names, and lists a shown file or folder when it is opened', async () => {
    const asked: unknown[] = [];
    renderWithProviders(
      <ScoredResult
        grading={grading({
          status: 'graded',
          inputs: { time_limit: 2, checker: { file: 'checker.py' } },
          runs: [
            {
              ...run([]),
              group: 'all',
              tuples: [{ title: null, key: { tests: { folder: 'tests/big' } } }],
            },
          ],
        })}
        readFiles={(ask) => {
          asked.push(ask);
          return Promise.resolve(
            ask.group === null
              ? [{ path: null, download: '/-/downloads/checker' }]
              : [
                  { path: '1.in', download: '/-/downloads/big/1.in' },
                  { path: '2.in', download: '/-/downloads/big/2.in' },
                ],
          );
        }}
      />,
    );
    const inputs = screen.getByLabelText('Inputs');
    expect(inputs).toHaveTextContent('time_limit2');
    await userEvent.click(
      within(inputs).getByRole('button', { name: 'Files of checker' }),
    );
    expect(
      await within(inputs).findByRole('link', { name: 'checker.py' }),
    ).toHaveAttribute('href', '/-/downloads/checker');

    const all = screen.getByRole('region', { name: 'Group all' });
    expect(all).toHaveTextContent('big/');
    await userEvent.click(
      within(all).getByRole('button', { name: 'Files of tests, all Test 1' }),
    );
    expect(await within(all).findByRole('link', { name: '2.in' })).toHaveAttribute(
      'href',
      '/-/downloads/big/2.in',
    );
    expect(asked).toEqual([
      { group: null, place: null, name: 'checker' },
      { group: 'all', place: 1, name: 'tests' },
    ]);
  });
});
