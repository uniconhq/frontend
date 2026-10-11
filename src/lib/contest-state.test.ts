import { describe, expect, it } from 'vitest';
import { byWhatMattersNow, datesLine, standingOf } from './contest-state';
import { formatDateTime } from './time';

const NOW = new Date('2026-10-11T12:00:00Z');

const contest = (
  state: 'draft' | 'published' | 'archived',
  start: string,
  end: string,
) => ({ state, start, end });

describe('where a contest stands', () => {
  it('is a draft or archived as its state says, whatever its dates', () => {
    expect(
      standingOf(contest('draft', '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z'), NOW),
    ).toBe('draft');
    expect(
      standingOf(
        contest('archived', '2026-12-01T00:00:00Z', '2026-12-02T00:00:00Z'),
        NOW,
      ),
    ).toBe('archived');
  });

  it('is live once opened until its end, and finished after', () => {
    expect(
      standingOf(
        contest('published', '2026-10-20T00:00:00Z', '2026-10-21T00:00:00Z'),
        NOW,
      ),
    ).toBe('live');
    expect(
      standingOf(
        contest('published', '2026-10-10T00:00:00Z', '2026-10-12T00:00:00Z'),
        NOW,
      ),
    ).toBe('live');
    expect(
      standingOf(
        contest('published', '2026-10-01T00:00:00Z', '2026-10-11T12:00:00Z'),
        NOW,
      ),
    ).toBe('finished');
  });

  it('says the date that matters for where it stands', () => {
    const at = (iso: string) => formatDateTime(new Date(iso));
    expect(
      datesLine(
        contest('published', '2026-10-20T00:00:00Z', '2026-10-21T00:00:00Z'),
        NOW,
      ),
    ).toBe(`Starts ${at('2026-10-20T00:00:00Z')}`);
    expect(
      datesLine(
        contest('published', '2026-10-10T00:00:00Z', '2026-10-12T00:00:00Z'),
        NOW,
      ),
    ).toBe(`Running until ${at('2026-10-12T00:00:00Z')}`);
    expect(
      datesLine(
        contest('published', '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z'),
        NOW,
      ),
    ).toBe(`Ended ${at('2026-10-02T00:00:00Z')}`);
    expect(
      datesLine(contest('draft', '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z'), NOW),
    ).toBe(`${at('2026-10-01T00:00:00Z')} to ${at('2026-10-02T00:00:00Z')}`);
  });
});

describe('the order of an org’s contests', () => {
  it('puts the running ones first, then those to come, drafts, and the ended last', () => {
    const listed = [
      {
        name: 'old',
        contest: contest('published', '2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z'),
      },
      { name: 'unread', contest: null },
      {
        name: 'later',
        contest: contest('published', '2026-12-01T00:00:00Z', '2026-12-02T00:00:00Z'),
      },
      {
        name: 'draft',
        contest: contest('draft', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z'),
      },
      {
        name: 'stored',
        contest: contest('archived', '2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'),
      },
      {
        name: 'now-long',
        contest: contest('published', '2026-10-01T00:00:00Z', '2026-10-30T00:00:00Z'),
      },
      {
        name: 'soon',
        contest: contest('published', '2026-10-15T00:00:00Z', '2026-10-16T00:00:00Z'),
      },
      {
        name: 'now-short',
        contest: contest('published', '2026-10-11T00:00:00Z', '2026-10-11T18:00:00Z'),
      },
      {
        name: 'recent',
        contest: contest('published', '2026-10-05T00:00:00Z', '2026-10-06T00:00:00Z'),
      },
    ];

    expect(byWhatMattersNow(listed, NOW).map((entry) => entry.name)).toEqual([
      'now-short',
      'now-long',
      'soon',
      'later',
      'draft',
      'recent',
      'old',
      'stored',
      'unread',
    ]);
  });
});
