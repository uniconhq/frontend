import { describe, expect, it } from 'vitest';
import { contestPlace, placeHref, stepsOf } from './places';

describe('where a refused setting of the contest is changed', () => {
  it('splits a setting’s place as the forge writes it', () => {
    expect(stepsOf('registration.ways[1].signup.code')).toEqual([
      'registration',
      'ways',
      1,
      'signup',
      'code',
    ]);
    expect(stepsOf('leaderboards[0].order[2].per_attempt')).toEqual([
      'leaderboards',
      0,
      'order',
      2,
      'per_attempt',
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
      'tasks[1].late_per_day',
      'Tasks, B: Taken off per late day',
      '/orgs/acme/contests/spring?part=tasks&field=late_per_day&item=1',
    ],
    ['tasks', 'Tasks', '/orgs/acme/contests/spring?part=tasks'],
    [
      'leaderboards[0].rows',
      'Leaderboards, leaderboard 1: Rows shown',
      '/orgs/acme/contests/spring/boards?field=rows&item=0',
    ],
    [
      'leaderboards.gradebook.title',
      'Leaderboards, gradebook: Title',
      '/orgs/acme/contests/spring/boards?field=gradebook.title',
    ],
    [
      'leaderboards.gradebook.columns.solved',
      'Leaderboards, gradebook: solved',
      '/orgs/acme/contests/spring/boards?field=gradebook.columns.solved',
    ],
    [
      'leaderboards.gradebook.audience.rows',
      'Leaderboards, gradebook: Rows',
      '/orgs/acme/contests/spring/boards?field=gradebook.audience.rows',
    ],
    [
      'hold.from',
      'Leaderboards, Hold: From',
      '/orgs/acme/contests/spring/boards?field=hold.from',
    ],
    [
      'hold.until',
      'Leaderboards, Hold: Until',
      '/orgs/acme/contests/spring/boards?field=hold.until',
    ],
    ['', 'Settings', '/orgs/acme/contests/spring/settings'],
    ['team_size', 'Settings', '/orgs/acme/contests/spring/settings'],
  ])('says %s in words and opens it', (path, label, href) => {
    const place = contestPlace(path);
    expect(place.label).toBe(label);
    expect(placeHref('acme', 'spring', place)).toBe(href);
  });
});
