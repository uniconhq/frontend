import { describe, expect, it } from 'vitest';
import { taskPlace, taskPlaceOf } from './places';

const TITLES = new Map([['time_limit', 'Time limit']]);
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
      'credit.relative',
      'Tests and scoring: How a test earns',
      `${PAGE}?card=tests&field=credit`,
    ],
    ['test_groups', 'Tests and scoring: Test groups', `${PAGE}?card=tests`],
    [
      'test_groups.small',
      'Tests and scoring, small',
      `${PAGE}?card=tests&field=rule&item=small`,
    ],
    [
      'test_groups.small.show',
      'Tests and scoring, small: When entrants see results',
      `${PAGE}?card=tests&field=show&item=small`,
    ],
    [
      'test_groups.main.pass_at',
      'Tests and scoring, main: Share of tests that must pass',
      `${PAGE}?card=tests&field=rule&item=main`,
    ],
    [
      'test_groups.main.test_weights.7',
      'Tests and scoring, main, test 7: Test weight',
      `${PAGE}?card=tests&field=test%3A7&item=main`,
    ],
    [
      'submissions.rate.per',
      'Tests and scoring, Submission rules: Length of the window',
      `${PAGE}?card=tests&field=per`,
    ],
    [
      'submissions.max',
      'Tests and scoring, Submission rules: Most submissions',
      `${PAGE}?card=tests&field=max`,
    ],
    ['tests/', 'Tests', `${PAGE}?card=tests`],
    ['tests/large/', 'Tests, large', `${PAGE}?card=tests&item=large`],
    [
      'tests/large/3/answer.txt',
      'Tests, large, test 3',
      `${PAGE}?card=tests&field=test%3A3&item=large`,
    ],
    ['statement.md', 'Statement', `${PAGE}?card=statement`],
  ])('%s is %s', (path, label, to) => {
    expect(taskPlaceOf('acme', 'spring', 'sum', TITLES)(path, '')).toEqual({
      label,
      to,
    });
  });

  it('places a problem of the whole file by what its sentence is about', () => {
    expect(taskPlace('', 'The test main/1 has no answer.').card).toBe('tests');
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
