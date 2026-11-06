import { describe, expect, it } from 'vitest';
import type { TaskStanding } from '@/api/types';
import { formatDateTime } from '@/lib/time';
import { taskMay } from '@/test/may';
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
      toolchains: {},
      results: { history: [], released: false },
      may: taskMay('admin'),
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
