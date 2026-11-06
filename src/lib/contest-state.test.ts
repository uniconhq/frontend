import { describe, expect, it } from 'vitest';
import { byWhatMattersNow, datesLine, standingOf, statusLine } from './contest-state';
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
    ).toBe(`Live until ${at('2026-10-12T00:00:00Z')}`);
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

describe("the contest's status badge", () => {
  const at = (iso: string) => formatDateTime(new Date(iso));

  it('says a draft is a draft, whatever its dates', () => {
    expect(
      statusLine(
        contest('draft', '2026-10-20T00:00:00Z', '2026-10-21T00:00:00Z'),
        NOW,
        true,
      ),
    ).toBe('Draft');
  });

  it('says when a scheduled contest starts, and in how long', () => {
    const start = '2026-10-13T16:00:00Z';
    expect(
      statusLine(contest('published', start, '2026-10-20T00:00:00Z'), NOW, true),
    ).toBe(`Starts ${at(start)} · in 2d 4h`);
  });

  it('says a live contest is live, when it ends, and in how long', () => {
    const end = '2026-10-25T09:00:00Z';
    expect(
      statusLine(contest('published', '2026-10-01T00:00:00Z', end), NOW, true),
    ).toBe(`Live · ends ${at(end)} · in 13d 21h`);
  });

  it('says when an ended contest ended, with nothing to count', () => {
    const end = '2026-10-05T00:00:00Z';
    expect(
      statusLine(contest('published', '2026-10-01T00:00:00Z', end), NOW, true),
    ).toBe(`Ended ${at(end)}`);
  });

  it('leaves the count out until the server clock is known', () => {
    const end = '2026-10-25T09:00:00Z';
    expect(
      statusLine(contest('published', '2026-10-01T00:00:00Z', end), NOW, false),
    ).toBe(`Live · ends ${at(end)}`);
  });
});
