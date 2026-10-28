import { describe, expect, it } from 'vitest';
import { taskPlace, taskPlaceOf } from './places';

const TITLES = new Map([
  ['time_limit', 'Time limit'],
  ['checker', 'Checker'],
  ['tests', 'Tests to run'],
]);
const PAGE = '/orgs/acme/contests/spring/tasks/sum';

describe('where a refused setting or file of the task is changed', () => {
  it.each([
    ['name', 'Settings: Title', `${PAGE}/settings?field=name`],
    ['workflow', 'Workflow', `${PAGE}?card=workflow&field=workflow`],
    ['steps[1].with.binary', 'Workflow', `${PAGE}?card=workflow&field=workflow`],
    ['inputs', 'Inputs', `${PAGE}?card=inputs`],
    ['inputs.time_limit', 'Inputs: Time limit', `${PAGE}?card=inputs&field=time_limit`],
    [
      'inputs.language.options',
      'Inputs: language',
      `${PAGE}?card=inputs&field=language`,
    ],
    [
      'submissions.rate.per',
      'Submissions: Length of the window',
      `${PAGE}?card=tests&field=per`,
    ],
    [
      'submissions.max',
      'Submissions: Most submissions',
      `${PAGE}?card=tests&field=max`,
    ],
    [
      'repeat[0].tuples[1].title',
      'Runs, table 1, row 2: title',
      `${PAGE}?card=runs&field=axis-0-tuple-1-title`,
    ],
    [
      'repeat[0].tuples[1].max_size',
      'Runs, table 1, row 2: max_size',
      `${PAGE}?card=runs&field=axis-0-tuple-1-max_size`,
    ],
    [
      'repeat[1].tuples[0].seed',
      'Runs, table 2, row 1: seed',
      `${PAGE}?card=runs&field=axis-1-tuple-0-seed`,
    ],
    [
      'scoring.values.first_failed.of[0]',
      'Scoring: first_failed',
      `${PAGE}?card=scoring&field=value-first_failed`,
    ],
    [
      'checks[0].expect.verdict',
      'Checks: check 1',
      `${PAGE}?card=checks&field=check-0`,
    ],
    ['statement.md', 'Statement', `${PAGE}?card=statement`],
    // A setting's own files, under its folder (M51), or under inputs/ for an
    // input whose id is a folder the format gives meaning to.
    ['checker/checker.py', 'Inputs: Checker', `${PAGE}?card=inputs&field=checker`],
    ['checker/lib/util.h', 'Inputs: Checker', `${PAGE}?card=inputs&field=checker`],
    [
      'inputs/tests/runner.py',
      'Inputs: Tests to run',
      `${PAGE}?card=inputs&field=tests`,
    ],
    ['inputs/checker/a.py', 'Inputs: Checker', `${PAGE}?card=inputs&field=checker`],
  ])('%s is %s', (path, label, to) => {
    expect(taskPlaceOf('acme', 'spring', 'sum', TITLES)(path, '')).toEqual({
      label,
      to,
    });
  });

  it('places a file in a folder no input is named for as before', () => {
    expect(taskPlace('notes/plan.txt', '', TITLES).card).toBe('settings');
    expect(taskPlace('checker/checker.py').card).toBe('settings');
  });

  it('places a problem of the whole file by what its sentence is about', () => {
    expect(taskPlace('', 'The workflow cannot be read.').card).toBe('workflow');
    expect(taskPlace('', 'An input is missing.').card).toBe('inputs');
    expect(taskPlace('', 'It is not a mapping.')).toEqual({
      card: 'settings',
      label: 'Settings',
      field: null,
      item: null,
    });
  });
});
