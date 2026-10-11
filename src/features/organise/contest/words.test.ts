import { describe, expect, it } from 'vitest';
import type { TaskStanding } from '@/api/types';
import { formatDateTime } from '@/lib/time';
import { NumberText } from '../forms/yaml-doc';
import { contestFieldName, contestValueWords } from './merge-words';
import { fractionOf, percentOf } from './percent';
import { timelineSentence } from './timeline';

describe('a late rate as a percentage and back, exactly', () => {
  it.each([
    ['0.1', '10'],
    ['0.125', '12.5'],
    ['1', '100'],
    ['0.0001', '0.01'],
    ['0.333333333333333333333', '33.3333333333333333333'],
  ])('reads %s as %s%% and writes it back the same', (fraction, percent) => {
    expect(percentOf(fraction)).toBe(percent);
    expect(fractionOf(percent)).toBe(fraction);
  });

  it('leaves empty text and text that is no plain decimal as they are', () => {
    expect(percentOf('')).toBe('');
    expect(fractionOf('ten')).toBe('ten');
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
    expect(
      contestFieldName(['leaderboards', { key: 'name', value: 'Standings' }, 'who']),
    ).toBe('Leaderboard Standings: Shown to');
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
    state: { head: 'a', latest: null, draft: false, errors: [] },
    timeline: {
      worth: '1',
      release_at: '2026-10-01T09:00:00Z',
      due: '2026-10-02T09:00:00Z',
      late_per_day: '0.25',
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
      `1 point · opens with the contest · due ${formatDateTime(new Date('2026-10-02T09:00:00Z'))} · loses 25% per started day late · closes ${formatDateTime(new Date('2026-10-03T09:00:00Z'))}`,
    );
  });

  it('says a task not yet published has its points then, and the marks a board counts', () => {
    expect(
      timelineSentence(
        { ...standing, timeline: { ...standing.timeline, worth: null, due: null } },
        null,
        '1',
      ),
    ).toBe(
      `points known once the task is published · opens ${formatDateTime(new Date('2026-10-01T09:00:00Z'))} · closes ${formatDateTime(new Date('2026-10-03T09:00:00Z'))} · up to 1 marked submission`,
    );
  });
});
