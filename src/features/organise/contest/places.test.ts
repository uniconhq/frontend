import { describe, expect, it } from 'vitest';
import { boardNames, contestPlace, placeHref, stepsOf } from './places';

describe('where a refused setting of the contest is changed', () => {
  it('splits a setting’s place as the forge writes it', () => {
    expect(stepsOf('registration.ways[1].signup.code')).toEqual([
      'registration',
      'ways',
      1,
      'signup',
      'code',
    ]);
    expect(stepsOf('leaderboards.final.sort[2]')).toEqual([
      'leaderboards',
      'final',
      'sort',
      2,
    ]);
    expect(stepsOf('')).toEqual([]);
  });

  it.each([
    [
      'name',
      'Settings, Basics: Name',
      '/orgs/acme/contests/spring/settings?field=name',
    ],
    ['end', 'Settings, Schedule: End', '/orgs/acme/contests/spring/settings?field=end'],
    [
      'entrants.most',
      'Settings, Teams: Most people in a team',
      '/orgs/acme/contests/spring/settings?field=most',
    ],
    [
      'entrants.fewest',
      'Settings, Teams: Fewest people in a team',
      '/orgs/acme/contests/spring/settings?field=fewest',
    ],
    ['on_system_error', 'Settings', '/orgs/acme/contests/spring/settings'],
    [
      'state',
      'Status: Open, draft or archived',
      '/orgs/acme/contests/spring?field=state',
    ],
    [
      'visibility',
      'Status: Who sees it',
      '/orgs/acme/contests/spring?field=visibility',
    ],
    [
      'registration.capacity',
      'How people enter: Most entrants',
      '/orgs/acme/contests/spring/entry?field=capacity',
    ],
    [
      'registration.ways[1].signup.domains[0]',
      'How people enter, way 2: Email domains',
      '/orgs/acme/contests/spring/entry?field=domains&item=1',
    ],
    [
      'registration.ways[1].signup.name',
      'How people enter, way 2: Name of this sign-up',
      '/orgs/acme/contests/spring/entry?field=name&item=1',
    ],
    [
      'registration.ways[0]',
      'How people enter, way 1',
      '/orgs/acme/contests/spring/entry?field=way&item=0',
    ],
    [
      'tasks[1].closes',
      'Tasks, B: Closes',
      '/orgs/acme/contests/spring?part=tasks&field=closes&item=1',
    ],
    ['tasks', 'Tasks', '/orgs/acme/contests/spring?part=tasks'],
    [
      'leaderboards.gradebook.title',
      'Leaderboards, gradebook: Name',
      '/orgs/acme/contests/spring/leaderboards?field=gradebook.title',
    ],
    [
      'leaderboards.gradebook.columns.solved',
      'Leaderboards, gradebook: solved',
      '/orgs/acme/contests/spring/leaderboards?field=gradebook.columns.solved',
    ],
    [
      'leaderboards.gradebook.audience.rows',
      'Leaderboards, gradebook: How many rows do they see?',
      '/orgs/acme/contests/spring/leaderboards?field=gradebook.audience.rows',
    ],
    [
      'leaderboards.gradebook.audience.who',
      'Leaderboards, gradebook: Who can see this leaderboard?',
      '/orgs/acme/contests/spring/leaderboards?field=gradebook.audience.who',
    ],
    [
      'leaderboards.gradebook.sort[1]',
      'Leaderboards, gradebook: Ranking',
      '/orgs/acme/contests/spring/leaderboards?field=gradebook.sort',
    ],
    [
      'leaderboards.gradebook.display',
      'Leaderboards, gradebook: Shown on the leaderboard',
      '/orgs/acme/contests/spring/leaderboards?field=gradebook.display',
    ],
    [
      'entrants.locks',
      'Settings, Teams: Teams are fixed',
      '/orgs/acme/contests/spring/settings?field=locks',
    ],
    [
      'tasks[0].marks',
      'Tasks, A: Submissions each entrant may mark',
      '/orgs/acme/contests/spring?part=tasks&field=marks&item=0',
    ],
    [
      'hold.from',
      'Leaderboards, Freeze: Freeze from',
      '/orgs/acme/contests/spring/leaderboards?field=hold.from',
    ],
    [
      'hold.until',
      'Leaderboards, Freeze: Until',
      '/orgs/acme/contests/spring/leaderboards?field=hold.until',
    ],
    ['', 'Settings', '/orgs/acme/contests/spring/settings'],
    ['team_size', 'Settings', '/orgs/acme/contests/spring/settings'],
  ])('says %s in words and opens it', (path, label, href) => {
    const place = contestPlace(path);
    expect(place.label).toBe(label);
    expect(placeHref('acme', 'spring', place)).toBe(href);
  });

  it('names a leaderboard as its card does, by its key while it has no name', () => {
    const names = boardNames(
      [
        'leaderboards:',
        '  icpc:',
        '    title: ICPC',
        '    columns: {solved: 1}',
        '  gradebook:',
        '    columns: {points: 1}',
        '',
      ].join('\n'),
    );
    expect(names).toEqual({ icpc: 'ICPC' });
    const place = contestPlace('leaderboards.icpc.columns.solved', names);
    expect(place.label).toBe('Leaderboards, ICPC: solved');
    expect(placeHref('acme', 'spring', place)).toBe(
      '/orgs/acme/contests/spring/leaderboards?field=icpc.columns.solved',
    );
    expect(contestPlace('leaderboards.gradebook.sort', names).label).toBe(
      'Leaderboards, gradebook: Ranking',
    );
    expect(boardNames('leaderboards: [')).toEqual({});
  });
});
