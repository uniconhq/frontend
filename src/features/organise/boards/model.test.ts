import { describe, expect, it } from 'vitest';
import { specCatalogue } from '../formula/catalogue';
import { exactJS, isRecord, parseYaml, textOf, writeOver, type Doc } from '../forms/yaml-doc';
import {
  commit,
  hourBefore,
  previewRows,
  problems,
  readLeaderboards,
  writeHold,
  writeLeaderboards,
  type BoardDraft,
  type LeaderboardsDraft,
} from './model';

const catalogue = specCatalogue();

const FILE = [
  'name: Spring',
  'start: 2030-10-01T09:00:00Z',
  'end: 2030-10-01T14:00:00Z',
  'tasks:',
  '  - id: islands',
  '',
].join('\n');

function open(text: string): Doc {
  const parsed = parseYaml(text);
  if ('error' in parsed) throw new Error(parsed.error);
  return parsed.doc;
}

function board(over: Partial<BoardDraft> & Pick<BoardDraft, 'key'>): BoardDraft {
  return {
    id: over.key,
    title: '',
    who: 'staff',
    rows: 'all',
    top: '10',
    columns: [{ key: 'c', name: 'points', line: null, tree: '1' }],
    sort: [{ name: 'points', way: 'desc' }],
    display: [{ name: 'points', places: '' }],
    ...over,
  };
}

function draft(doc: Doc, boards: BoardDraft[], hold: LeaderboardsDraft['hold']): LeaderboardsDraft {
  return { ...readLeaderboards(doc), boards, hold };
}

describe('leaderboards written into contest.yaml', () => {
  it('writes the gradebook, the olympiad, ICPC and a hold', () => {
    const doc = open(FILE);
    const before = readLeaderboards(doc);
    const end = new Date('2030-10-01T14:00:00Z').getTime();
    const from = hourBefore('2030-10-01T14:00:00Z');
    const next = commit(
      draft(
        doc,
        [
          board({
            key: 'gradebook',
            title: 'Course gradebook',
            who: 'entrants',
            rows: 'own',
          }),
          board({ key: 'olympiad', title: 'Olympiad', who: 'everyone' }),
          board({
            key: 'icpc',
            title: 'ICPC',
            who: 'everyone',
            columns: [
              { key: 's', name: 'solved', line: null, tree: '1' },
              { key: 'p', name: 'penalty', line: null, tree: '1' },
              { key: 'l', name: 'last_solve', line: null, tree: '1' },
            ],
            sort: [
              { name: 'solved', way: 'desc' },
              { name: 'penalty', way: 'asc' },
              { name: 'last_solve', way: 'asc' },
            ],
            display: [
              { name: 'solved', places: '' },
              { name: 'penalty', places: '' },
              { name: 'last_solve', places: '' },
            ],
          }),
        ],
        { locked: false, on: true, from, untilStaff: true, until: '' },
      ),
      catalogue,
      ['islands'],
      [],
    );
    writeLeaderboards(doc, before, next);
    writeHold(doc, before, next);
    const saved = exactJS(doc);
    if (!isRecord(saved) || !isRecord(saved['leaderboards']) || !isRecord(saved['hold'])) {
      throw new Error('leaderboards were not written');
    }
    const gradebook = saved['leaderboards']['gradebook'];
    const icpc = saved['leaderboards']['icpc'];
    if (!isRecord(gradebook) || !isRecord(icpc) || !isRecord(icpc['columns'])) {
      throw new Error('a leaderboard was not written');
    }
    expect(gradebook['audience']).toEqual({ who: 'entrants', rows: 'own' });
    expect(gradebook['title']).toBe('Course gradebook');
    expect(saved['leaderboards']['olympiad']).toMatchObject({
      title: 'Olympiad',
      audience: { who: 'everyone', rows: 'all' },
    });
    expect(icpc['sort']).toEqual([
      { solved: 'desc' },
      { penalty: 'asc' },
      { last_solve: 'asc' },
    ]);
    expect(textOf(icpc['columns']['solved'])).toBe('1');
    expect(saved['hold']['until']).toBe('staff');
    expect(new Date(textOf(saved['hold']['from'])).getTime()).toBe(end - 60 * 60 * 1000);
    expect(writeOver(FILE, doc)).toContain('gradebook:');
  });

  it('leaves a list of leaderboards as stored', () => {
    const text = 'leaderboards:\n  - name: Standings\n';
    const doc = open(text);
    const read = readLeaderboards(doc);
    expect(read.legacy).toBe(true);
    writeLeaderboards(doc, read, { ...read, boards: [board({ key: 'gradebook' })] });
    const saved = exactJS(doc);
    expect(isRecord(saved) && Array.isArray(saved['leaderboards'])).toBe(true);
  });
});

describe('what the editor refuses', () => {
  const now = new Date('2026-10-25T00:00:00Z').getTime();

  function found(over: Partial<BoardDraft> & Pick<BoardDraft, 'key'>, tasks = ['islands']) {
    const doc = open(FILE);
    const one = draft(doc, [board(over)], {
      locked: false,
      on: false,
      from: '',
      untilStaff: true,
      until: '',
    });
    return problems(one, catalogue, tasks, [], now, '2030-10-01T09:00:00Z', '2030-10-01T14:00:00Z');
  }

  it('refuses a key the save would refuse', () => {
    expect(found({ key: 'a'.repeat(25) }).map((item) => item.message).join(' ')).toMatch(/24/);
    expect(found({ key: 'islands' }).map((item) => item.message).join(' ')).toMatch(
      /tasks and leaderboards share one set of names/,
    );
  });

  it('refuses own rows for everyone, a sorted text column and a shown pick', () => {
    expect(
      found({ key: 'gradebook', who: 'everyone', rows: 'own' }).some((item) =>
        item.message.includes('guest has none'),
      ),
    ).toBe(true);
    const text = found({
      key: 'notes',
      columns: [{ key: 'c', name: 'note', line: '"hi"', tree: null }],
      sort: [{ name: 'note', way: 'desc' }],
      display: [{ name: 'note', places: '' }],
    });
    expect(text.some((item) => item.message.includes('text column'))).toBe(true);
    const pick = found({
      key: 'latest',
      columns: [{ key: 'c', name: 'last', line: 'latest(islands)', tree: null }],
      sort: [{ name: 'last', way: 'desc' }],
      display: [{ name: 'last', places: '' }],
    });
    expect(pick.some((item) => item.field === 'latest.display' && item.message.includes('pick'))).toBe(
      true,
    );
    expect(pick.some((item) => item.field === 'latest.sort' && item.message.includes('pick'))).toBe(
      true,
    );
  });

  it('does not call a saved formula empty before the catalogue loads', () => {
    const doc = open(FILE);
    const one = draft(doc, [board({ key: 'gradebook' })], {
      locked: false,
      on: false,
      from: '',
      untilStaff: true,
      until: '',
    });
    expect(
      problems(
        one,
        null,
        [],
        [],
        now,
        '2030-10-01T09:00:00Z',
        '2030-10-01T14:00:00Z',
      ).some((item) => item.message === 'Give a formula.'),
    ).toBe(false);
  });

  it('refuses a hold that has already started', () => {
    const doc = open(FILE);
    const one = draft(doc, [], {
      locked: false,
      on: true,
      from: '2020-01-01T00:00',
      untilStaff: true,
      until: '',
    });
    expect(
      problems(one, catalogue, [], [], now, '2030-10-01T09:00:00Z', '2030-10-01T14:00:00Z').some(
        (item) => item.field === 'hold.from',
      ),
    ).toBe(true);
  });
});

describe('a preview cut', () => {
  const rows = [
    { place: 1, row: { entrant: 'a' } },
    { place: 2, row: { entrant: 'b' } },
    { place: 3, row: { entrant: 'c' } },
    { place: 3, row: { entrant: 'd' } },
    { place: 5, row: { entrant: 'e' } },
  ];

  it('keeps the tie at the cut and the entrant’s own row, and drops the place on their row alone', () => {
    expect(previewRows(rows, 'e', 'top', 3).map((row) => row.row.entrant)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
    expect(previewRows(rows, 'c', 'own', 3)).toEqual([{ place: null, row: { entrant: 'c' } }]);
  });
});
