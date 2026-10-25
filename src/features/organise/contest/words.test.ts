import { describe, expect, it } from 'vitest';
import type { TaskStanding } from '@/api/types';
import { formatDateTime } from '@/lib/time';
import { NumberText } from '../forms/yaml-doc';
import { contestFieldName, contestValueWords } from './merge-words';
import { timelineSentence } from './timeline';
import { teamsSentence } from './words';

describe('how big a team is, as the settings card says it', () => {
  it.each([
    [{ most: '', fewest: '', locks: 'start' }, 'Everyone enters alone'],
    [{ most: '1', fewest: '', locks: 'start' }, 'Everyone enters alone'],
    [
      { most: '3', fewest: '', locks: 'start' },
      'Teams of up to 3 people, fixed when the contest starts',
    ],
    [
      { most: '3', fewest: '2', locks: 'start' },
      'Teams of 2 to 3 people, fixed when the contest starts',
    ],
    [
      { most: '2', fewest: '2', locks: 'first_submission' },
      'Teams of exactly 2 people, fixed at a team’s first submission',
    ],
  ])('says %o as %s', (values, sentence) => {
    expect(teamsSentence(values)).toBe(sentence);
  });
});

describe('the contest’s settings in words for the merge', () => {
  it('names each setting as its page does, a task and a board by name', () => {
    expect(contestFieldName(['name'])).toBe('Name');
    expect(contestFieldName(['entrants', 'locks'])).toBe('When teams are fixed');
    expect(contestFieldName(['registration', 'ways'])).toBe('Ways in');
    expect(contestFieldName(['tasks', { key: 'id', value: 'sum' }, 'due'])).toBe(
      'Task sum: Due',
    );
    expect(contestFieldName(['leaderboards', 'standings', 'audience'])).toBe(
      'Leaderboard standings: Who sees it',
    );
    expect(contestFieldName(['tasks'])).toBe('Tasks');
  });

  it('says each value as the pages do, and leaves names and numbers be', () => {
    expect(contestValueWords(['state'], 'published')).toBe('Open');
    expect(contestValueWords(['visibility'], 'hidden')).toBe(
      'Only its entrants and organisers',
    );
    expect(contestValueWords(['entrants', 'locks'], 'first_submission')).toBe(
      'At its first submission',
    );
    expect(
      contestValueWords(
        ['registration', 'ways'],
        [{ invite: {} }, { signup: { name: 'Guests' } }],
      ),
    ).toBe('People you invite, Sign-up “Guests”');
    expect(
      contestValueWords(['entrants'], { most: new NumberText('3'), locks: 'start' }),
    ).toBe('Most people in a team: 3; When teams are fixed: When the contest starts');
    expect(contestValueWords(['name'], 'Spring')).toBeNull();
  });
});

describe("a task's timeline as one line", () => {
  const standing: TaskStanding = {
    task: { name: 'sum' },
    label: 'A',
    withdrawn: false,
    submissions: 0,
    take_out: 'remove',
    state: {
      head: 'a',
      latest: null,
      draft: false,
      errors: [],
      statement_written: false,
      head_statement_written: false,
      results: { history: [], released: false },
    },
    timeline: {
      release_at: '2026-10-01T09:00:00Z',
      due: '2026-10-02T09:00:00Z',
      closes: '2026-10-03T09:00:00Z',
    },
  };

  it('says the contest’s own times as such, and each other time as itself', () => {
    expect(
      timelineSentence(
        standing,
        { start: '2026-10-01T09:00:00Z', end: '2026-10-05T09:00:00Z' },
        null,
      ),
    ).toBe(
      `opens with the contest; due ${formatDateTime(new Date('2026-10-02T09:00:00Z'))}; closes ${formatDateTime(new Date('2026-10-03T09:00:00Z'))}`,
    );
  });

  it('says a task open for the whole contest in so many words (M52)', () => {
    expect(
      timelineSentence(
        { ...standing, timeline: { ...standing.timeline, due: null } },
        { start: '2026-10-01T09:00:00Z', end: '2026-10-03T09:00:00Z' },
        null,
      ),
    ).toBe('open for the whole contest');
  });

  it('says when a task is open, and the marks a leaderboard counts', () => {
    expect(
      timelineSentence(
        { ...standing, timeline: { ...standing.timeline, due: null } },
        null,
        '1',
      ),
    ).toBe(
      `opens ${formatDateTime(new Date('2026-10-01T09:00:00Z'))}; closes ${formatDateTime(new Date('2026-10-03T09:00:00Z'))}; an entrant may mark up to 1 submission`,
    );
  });
});
