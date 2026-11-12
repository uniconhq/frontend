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
    [['name'], 'Settings: Title', `${PAGE}/settings?field=name`],
    [['workflow'], 'Workflow', `${PAGE}?card=workflow&field=workflow`],
    [
      ['steps', 1, 'with', 'binary'],
      'Workflow',
      `${PAGE}?card=workflow&field=workflow`,
    ],
    [['inputs'], 'Inputs', `${PAGE}?card=inputs`],
    [
      ['inputs', 'time_limit'],
      'Inputs: Time limit',
      `${PAGE}?card=inputs&field=time_limit`,
    ],
    [
      ['inputs', 'language', 'options'],
      'Inputs: language',
      `${PAGE}?card=inputs&field=language`,
    ],
    [
      ['submissions', 'rate', 'per'],
      'Submissions: Length of the window',
      `${PAGE}?card=tests&field=per`,
    ],
    [
      ['submissions', 'max'],
      'Submissions: Most submissions',
      `${PAGE}?card=tests&field=max`,
    ],
    [
      ['repeat', 0, 'tuples', 1, 'title'],
      'Runs, row 2: title',
      `${PAGE}?card=runs&field=axis-0-tuple-1-title`,
    ],
    [
      ['repeat', 0, 'tuples', 1, 'max_size'],
      'Runs, row 2: max_size',
      `${PAGE}?card=runs&field=axis-0-tuple-1-max_size`,
    ],
    [
      ['scoring', 'values', 'first_failed', 'of', 0],
      'Scoring: first_failed',
      `${PAGE}?card=scoring&field=value-first_failed`,
    ],
    [
      ['scoring', 'values', ''],
      'Scoring: a value with no name',
      `${PAGE}?card=scoring&field=value-`,
    ],
    [
      ['scoring', 'groups', 'small'],
      'Scoring: small',
      `${PAGE}?card=scoring&field=group-small`,
    ],
    [
      ['scoring', 'groups', ''],
      'Scoring: a group with no name',
      `${PAGE}?card=scoring&field=group-`,
    ],
    [
      ['checks', 0, 'expect', 'verdict'],
      'Checks: check 1',
      `${PAGE}?card=checks&field=check-0`,
    ],
    [['statement.md'], 'Statement', `${PAGE}?card=statement`],
    // A setting's own files, under its folder (M51).
    [['checker/checker.py'], 'Inputs: Checker', `${PAGE}?card=inputs&field=checker`],
    [['checker/lib/util.h'], 'Inputs: Checker', `${PAGE}?card=inputs&field=checker`],
  ])('%j is %s', (path, label, to) => {
    expect(taskPlaceOf('acme', 'spring', 'sum', TITLES)(path, '')).toEqual({
      label,
      to,
    });
  });

  it('places a file in a folder no input is named for as before', () => {
    expect(taskPlace(['notes/plan.txt'], '', TITLES).card).toBe('settings');
    expect(taskPlace(['checker/checker.py']).card).toBe('settings');
  });

  it('places a problem of the whole file by what its sentence is about', () => {
    expect(taskPlace([], 'The workflow cannot be read.').card).toBe('workflow');
    expect(taskPlace([], 'An input is missing.').card).toBe('inputs');
    expect(taskPlace([], 'It is not a mapping.')).toEqual({
      card: 'settings',
      label: 'Settings',
      field: null,
      item: null,
    });
  });
});
