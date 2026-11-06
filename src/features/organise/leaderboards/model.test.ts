import { keyFromName, withBoardName, audienceSentence, blankBoard } from './model';
import { describe, expect, it } from 'vitest';
import { specCatalogue } from '@/test/catalogue';
import {
  exactJS,
  isRecord,
  parseYaml,
  textOf,
  writeOver,
  type Doc,
} from '../forms/yaml-doc';
import {
  boardReadings,
  commit,
  givenValues,
  hourBefore,
  lineOf,
  previewRows,
  problems,
  readLeaderboards,
  writeHold,
  writeLeaderboards,
  type BoardDraft,
  type LeaderboardsDraft,
  type TaskGives,
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
    saved: true,
    who: 'staff',
    rows: 'all',
    top: '10',
    columns: [{ key: 'c', name: 'points', line: null, tree: '1' }],
    sort: [{ name: 'points', way: 'desc' }],
    display: [{ name: 'points', decimals: '' }],
    ...over,
  };
}

function draft(
  doc: Doc,
  boards: BoardDraft[],
  hold: LeaderboardsDraft['hold'],
): LeaderboardsDraft {
  return { ...readLeaderboards(doc), boards, hold };
}

describe('leaderboards written into contest.yaml', () => {
  it('writes and reads a column with decimals', () => {
    const doc = open(FILE);
    const before = readLeaderboards(doc);
    const next = commit(
      draft(
        doc,
        [
          board({
            key: 'standings',
            display: [{ name: 'points', decimals: '2' }],
          }),
        ],
        before.hold,
      ),
      catalogue,
      ['islands'],
      {},
    );
    writeLeaderboards(doc, before, next);
    const text = writeOver(FILE, doc);
    expect(text).toContain('decimals: 2');
    expect(text).not.toContain('places:');
    expect(readLeaderboards(open(text)).boards[0]?.display).toEqual([
      { name: 'points', decimals: '2' },
    ]);
  });

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
              { name: 'solved', decimals: '' },
              { name: 'penalty', decimals: '' },
              { name: 'last_solve', decimals: '' },
            ],
          }),
        ],
        { locked: false, on: true, from, untilStaff: true, until: '' },
      ),
      catalogue,
      ['islands'],
      {},
    );
    writeLeaderboards(doc, before, next);
    writeHold(doc, before, next);
    const saved = exactJS(doc);
    if (
      !isRecord(saved) ||
      !isRecord(saved['leaderboards']) ||
      !isRecord(saved['hold'])
    ) {
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
      audience: { who: 'everyone' },
    });
    expect(icpc['sort']).toEqual([
      { solved: 'desc' },
      { penalty: 'asc' },
      { last_solve: 'asc' },
    ]);
    expect(textOf(icpc['columns']['solved'])).toBe('1');
    expect(saved['hold']['until']).toBe('staff');
    expect(new Date(textOf(saved['hold']['from'])).getTime()).toBe(
      end - 60 * 60 * 1000,
    );
    expect(writeOver(FILE, doc)).toContain('gradebook:');
  });

  it('changes only what was edited, keeping order, style and comments, and renames in place', () => {
    const text = [
      'name: Spring',
      'tasks:',
      '  - id: islands',
      'leaderboards:',
      '  # the course gradebook',
      '  gradebook:',
      '    audience: {who: everyone} # everyone reads it',
      '    columns:',
      '      points: 1 # one each',
      '      bonus: 2',
      '    sort: [{points: desc}]',
      '    display: [points, bonus]',
      '  olympiad:',
      '    columns: {total: 3}',
      '',
    ].join('\n');
    const doc = open(text);
    const before = readLeaderboards(doc);
    const [gradebook, olympiad] = before.boards;
    if (gradebook === undefined || olympiad === undefined) throw new Error('no boards');
    const next = {
      ...before,
      boards: [
        {
          ...gradebook,
          columns: gradebook.columns.map((column) =>
            column.name === 'points' ? { ...column, name: 'score' } : column,
          ),
          sort: [{ name: 'score', way: 'desc' as const }],
          display: [
            { name: 'score', decimals: '' },
            { name: 'bonus', decimals: '' },
          ],
        },
        { ...olympiad, key: 'olympiad_2026' },
      ],
    };
    writeLeaderboards(doc, before, next);
    expect(writeOver(text, doc)).toBe(
      [
        'name: Spring',
        'tasks:',
        '  - id: islands',
        'leaderboards:',
        '  # the course gradebook',
        '  gradebook:',
        '    audience: {who: everyone} # everyone reads it',
        '    columns:',
        '      score: 1 # one each',
        '      bonus: 2',
        '    sort: [{score: desc}]',
        '    display: [score, bonus]',
        '  olympiad_2026:',
        '    columns: {total: 3}',
        '',
      ].join('\n'),
    );
  });

  const PAIR = [
    'leaderboards:',
    '  a:',
    '    title: A',
    '    audience: {who: staff}',
    '    columns:',
    '      x: 1',
    '      y: 2',
    '  b:',
    '    title: B',
    '    columns:',
    '      y: 3',
    '',
  ].join('\n');

  function rekeyed(edit: (board: BoardDraft) => BoardDraft): string {
    const doc = open(PAIR);
    const before = readLeaderboards(doc);
    writeLeaderboards(doc, before, { ...before, boards: before.boards.map(edit) });
    return writeOver(PAIR, doc);
  }

  it('renames a chain of leaderboards, a to b and b to c, and edits one on the way', () => {
    expect(
      rekeyed((item) =>
        item.key === 'a' ? { ...item, key: 'b', title: 'A2' } : { ...item, key: 'c' },
      ),
    ).toBe(
      [
        'leaderboards:',
        '  b:',
        '    title: A2',
        '    audience: {who: staff}',
        '    columns:',
        '      x: 1',
        '      y: 2',
        '  c:',
        '    title: B',
        '    columns:',
        '      y: 3',
        '',
      ].join('\n'),
    );
  });

  it('swaps two leaderboards, and two columns of one', () => {
    expect(
      rekeyed((item) => ({
        ...item,
        key: item.key === 'a' ? 'b' : 'a',
        columns: item.columns.map((column) => ({
          ...column,
          name: column.name === 'x' ? 'y' : column.name === 'y' ? 'x' : column.name,
        })),
        sort: [],
        display: [],
      })),
    ).toBe(
      [
        'leaderboards:',
        '  b:',
        '    title: A',
        '    audience: {who: staff}',
        '    columns:',
        '      y: 1',
        '      x: 2',
        '  a:',
        '    title: B',
        '    columns:',
        '      x: 3',
        '',
      ].join('\n'),
    );
  });

  it('reads leaderboards stored as a list as none, and writes over them once one is added', () => {
    const doc = open('leaderboards:\n  - name: Standings\n');
    const read = readLeaderboards(doc);
    expect(read.boards).toEqual([]);
    writeLeaderboards(doc, read, { ...read, boards: [board({ key: 'gradebook' })] });
    const saved = exactJS(doc);
    expect(isRecord(saved) && Object.keys(saved['leaderboards'] as object)).toEqual([
      'gradebook',
    ]);
  });
});

/**
 * The forge's Kaggle contest (forge tests/services/test_examples.py): the
 * task house-prices and its public and private leaderboards.
 */
const HOUSE_PRICES = `name: House prices
scoring:
  values:
    public: {block: max, over: {runs: public_split}, of: {run: [public_split, rmse]}}
    private: {block: max, over: {runs: private_split}, of: {run: [private_split, rmse]}}
`;
const KAGGLE = `name: Kaggle
start: 2030-10-01T09:00:00Z
end: 2030-10-01T14:00:00Z
tasks:
  - {id: house-prices, marks: 2}
leaderboards:
  public_leaderboard:
    title: Public
    audience: {who: everyone}
    columns:
      pub:
        block: lowest
        from: {results: house-prices}
        by: {value: [house-prices, public]}
        missing: skip
      public: {value: [{column: pub}, public]}
      public_at: {value: [{column: pub}, seconds]}
    sort: [{public: asc}, {public_at: asc}]
    display: [public, public_at]
  private_leaderboard:
    title: Private
    audience: {who: everyone}
    columns:
      pick:
        block: otherwise
        of:
          - block: lowest
            from: {results: house-prices}
            by: {value: [house-prices, private]}
            where: {value: [house-prices, marked]}
            missing: skip
          - block: lowest
            from: {results: house-prices}
            by: {value: [house-prices, public]}
            missing: skip
      private: {value: [{column: pick}, private]}
      at: {value: [{column: pick}, seconds]}
    sort: [{private: asc}, {at: asc}]
    display: [private, at]
`;

describe('a name with a -', () => {
  const tasks = ['house-prices'];
  const gives = { 'house-prices': givenValues(HOUSE_PRICES, new Set()) };

  it('prints the Kaggle contest with each - as _, and reads it back to the same trees', () => {
    const read = readLeaderboards(open(KAGGLE));
    const [pub, priv] = read.boards;
    if (pub === undefined || priv === undefined) throw new Error('no leaderboards');
    expect(pub.columns.map((column) => lineOf(column, catalogue))).toEqual([
      'lowest(house_prices, house_prices.public, missing: skip)',
      'pub.public',
      'pub.seconds',
    ]);
    expect(priv.columns.map((column) => lineOf(column, catalogue))).toEqual([
      'otherwise(lowest(house_prices, house_prices.private, house_prices.marked, skip), ' +
        'lowest(house_prices, house_prices.public, missing: skip))',
      'pick.private',
      'pick.seconds',
    ]);
    for (const one of read.boards) {
      const readings = boardReadings(one, read.boards, tasks, gives, catalogue);
      for (const column of one.columns) {
        expect(readings[column.key]?.problems).toEqual([]);
        expect(readings[column.key]?.tree).toEqual(column.tree);
      }
    }
  });

  it('reads a column, a leaderboard and its column written with _ as their names with -', () => {
    const own = board({
      key: 'best-of',
      columns: [
        {
          key: 'a',
          name: 'best-run',
          line: 'max(house_prices, house_prices.public)',
          tree: null,
        },
        {
          key: 'b',
          name: 'points',
          line: 'best_run + rival_board.top_score',
          tree: null,
        },
      ],
    });
    const rival = board({
      key: 'rival-board',
      columns: [{ key: 'c', name: 'top-score', line: null, tree: '1' }],
      sort: [{ name: 'top-score', way: 'desc' }],
      display: [{ name: 'top-score', decimals: '' }],
    });
    const one = draft(open(FILE), [own, rival], {
      locked: false,
      on: false,
      from: '',
      untilStaff: true,
      until: '',
    });
    const next = commit(one, catalogue, tasks, gives);
    expect(next.boards[0]?.columns.map((column) => column.tree)).toEqual([
      {
        block: 'max',
        over: { results: 'house-prices' },
        of: { value: ['house-prices', 'public'] },
      },
      {
        block: 'add',
        of: [{ column: 'best-run' }, { column: ['rival-board', 'top-score'] }],
      },
    ]);
    expect(problems(one, catalogue, tasks, gives)).toEqual([]);
  });
});

/** The forge's LAST contest (forge tests/test_leaderboards.py): a column of another board's pick column. */
const LAST = `name: Spring
tasks:
  - id: islands
leaderboards:
  one:
    columns:
      last: {block: latest, from: {results: islands}}
      total: {block: otherwise, of: [{value: [last, total]}, -1]}
    display: [total]
  two:
    columns:
      total: {block: otherwise, of: [{value: [{column: [one, last]}, score]}, -1]}
    display: [total]
`;

describe('a column of another leaderboard', () => {
  const tasks = ['islands'];
  const gives = {
    islands: [
      { name: 'total', text: false },
      { name: 'score', text: false },
    ],
  };

  it('reads a value off its pick column back to the tree it was printed from', () => {
    const read = readLeaderboards(open(LAST));
    const two = read.boards[1];
    if (two === undefined) throw new Error('no second leaderboard');
    const [total] = two.columns;
    if (total === undefined) throw new Error('no column');
    expect(lineOf(total, catalogue)).toBe('otherwise(one.last.score, -1)');
    const reading = boardReadings(two, read.boards, tasks, gives, catalogue)[total.key];
    expect(reading?.problems).toEqual([]);
    expect(reading?.tree).toEqual(total.tree);
  });

  it('says when that leaderboard has no such column', () => {
    const read = readLeaderboards(open(LAST));
    const two = read.boards[1];
    if (two === undefined) throw new Error('no second leaderboard');
    const typed = {
      ...two,
      columns: two.columns.map((column) => ({ ...column, line: 'one.first.score' })),
    };
    const [total] = typed.columns;
    if (total === undefined) throw new Error('no column');
    const reading = boardReadings(typed, read.boards, tasks, gives, catalogue)[
      total.key
    ];
    expect(reading?.problems.map((problem) => problem.message)).toEqual([
      'one has no column first',
    ]);
  });
});

describe('what the editor refuses', () => {
  const off = { locked: false, on: false, from: '', untilStaff: true, until: '' };

  function found(boards: BoardDraft[], hold = off) {
    return problems(draft(open(FILE), boards, hold), catalogue, ['islands'], {});
  }

  it('refuses only what the file has no place for: one key twice, a column with no name or a taken one', () => {
    expect(found([board({ key: 'a' }), board({ key: 'a' })])).toContainEqual({
      field: 'a.key',
      message: 'Another leaderboard has this key.',
    });
    const columns = (...names: string[]) =>
      found([
        board({
          key: 'b',
          columns: names.map((name, at) => ({
            key: `c${String(at)}`,
            name,
            line: null,
            tree: '1',
          })),
          sort: [],
          display: [],
        }),
      ]).map((item) => item.message);
    expect(columns('')).toEqual(['Give the column a name.']);
    expect(columns('x', 'x')).toEqual([
      'Another column has this name.',
      'Another column has this name.',
    ]);
  });

  it('leaves every other rule of a leaderboard to the save', () => {
    expect(
      found([
        board({ key: 'islands', who: 'everyone', rows: 'own', columns: [] }),
        board({
          key: 'notes',
          columns: [{ key: 'c', name: 'Note', line: '"hi"', tree: null }],
          sort: [
            { name: 'Note', way: 'desc' },
            { name: 'gone', way: 'asc' },
          ],
          display: [{ name: 'Note', decimals: '11' }],
        }),
      ]),
    ).toEqual([]);
  });

  it('does not call a saved formula empty before the catalogue loads', () => {
    const one = draft(open(FILE), [board({ key: 'gradebook' })], off);
    expect(
      problems(one, null, [], {}).some((item) => item.message === 'Give a formula.'),
    ).toBe(false);
  });

  it('asks for the hold’s times, leaving when they may be to the save', () => {
    const on = { ...off, on: true, untilStaff: false };
    expect(found([], on)).toEqual([
      { field: 'hold.from', message: 'Give the time the freeze starts.' },
      { field: 'hold.until', message: 'Give the time the freeze ends.' },
    ]);
    expect(
      found([], { ...on, from: '2020-01-01T01:00', until: '2020-01-01T00:00' }),
    ).toEqual([]);
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
    expect(previewRows(rows, 'c', 'own', 3)).toEqual([
      { place: null, row: { entrant: 'c' } },
    ]);
  });
});

describe('a task whose settings cannot be read', () => {
  const lines = ['sum(islands, islands.score)', 'otherwise(latest(islands).score, 0)'];
  const reading = (gives: TaskGives, line: string) => {
    const one = board({
      key: 'one',
      columns: [{ key: 'c', name: 'points', line, tree: null }],
    });
    return boardReadings(one, [one], ['islands'], gives, catalogue)['c'];
  };

  it('takes any value of it, as the forge does not check what it cannot resolve', () => {
    for (const line of lines) {
      expect(reading({ islands: null }, line)?.problems).toEqual([]);
    }
  });

  it('still refuses a value a task that was read does not give', () => {
    for (const line of lines) {
      expect(reading({ islands: [] }, line)?.problems.length).toBeGreaterThan(0);
    }
  });

  it('is unknown, not a task with no values, when its YAML cannot be read', () => {
    expect(givenValues('name: [', new Set())).toBeNull();
    expect(givenValues('name: Islands\n', new Set())).toEqual([]);
  });

  it('takes which values give text from the form, and does not guess from a formula', () => {
    const medal = 'name: Islands\nscoring:\n  values:\n    medal: {text: gold}\n';
    expect(givenValues(medal, null)).toBeNull();
    expect(givenValues(medal, new Set())).toEqual([{ name: 'medal', text: false }]);
    expect(givenValues(medal, new Set(['medal']))).toEqual([
      { name: 'medal', text: true },
    ]);
  });
});

describe('a stored column whose line does not read back to it', () => {
  const found = (column: BoardDraft['columns'][number]) =>
    problems(
      draft(open(FILE), [board({ key: 'one', columns: [column] })], {
        locked: false,
        on: false,
        from: '',
        untilStaff: true,
        until: '',
      }),
      catalogue,
      ['islands'],
      {},
    ).map((item) => item.message);
  const odd = { block: 'max', of: ['1', '2'], colour: 'red' };

  it('blocks nothing while the line is left as printed, as the stored tree is saved', () => {
    expect(found({ key: 'c', name: 'points', line: null, tree: odd })).toEqual([]);
  });

  it('blocks the line once it is edited to read otherwise', () => {
    expect(
      found({ key: 'c', name: 'points', line: 'max(1, red)', tree: odd }).length,
    ).toBeGreaterThan(0);
  });
});

describe('one leaderboard name', () => {
  it.each([
    ['Course Grade-book!', 'course_grade_book'],
    ['2026 results', 'board_2026_results'],
    ['', 'leaderboard'],
    ['é!@', 'leaderboard'],
    ['_Results', 'board__results'],
    ['a'.repeat(30), 'a'.repeat(24)],
  ])('makes the key for %s', (name, key) => expect(keyFromName(name, [])).toBe(key));
  it('avoids tasks, keys, and their written forms within the length limit', () => {
    expect(keyFromName('Course grade', ['course-grade', 'course_grade_2'])).toBe(
      'course_grade_3',
    );
    expect(keyFromName('a'.repeat(30), ['a'.repeat(24)])).toBe('a'.repeat(22) + '_2');
  });
  it('keeps a new name independent of a column in its own formula scope', () => {
    const fresh = blankBoard([]);
    const named = withBoardName(fresh, 'Points', []);
    expect(named.title).toBe('Points');
    expect(named.key).toBe('points_2');
  });
  it('keeps a saved key when its name changes', () => {
    const fresh = blankBoard([]);
    expect(withBoardName(fresh, 'Standings', []).key).toBe('standings');
    expect(withBoardName({ ...fresh, saved: true }, 'Standings', []).key).toBe(
      fresh.key,
    );
  });
  it.each([
    ['staff', 'all', 'Only organisers see this leaderboard, every row of it.'],
    [
      'entrants',
      'all',
      'Entrants see every row, ranked. Organisers always see every row.',
    ],
    [
      'entrants',
      'own',
      'Each entrant sees only their own row, with no place. Organisers always see every row, ranked.',
    ],
    [
      'entrants',
      'top',
      'Entrants see the top 10 rows, and their own row when it is lower. Organisers always see every row.',
    ],
    [
      'everyone',
      'all',
      'Anyone, signed in or not, sees every row, ranked. Organisers always see every row.',
    ],
    [
      'everyone',
      'top',
      'Anyone sees the top 10 rows; a signed-in entrant also sees their own row when it is lower. Organisers always see every row.',
    ],
  ] as const)('explains %s / %s', (who, rows, line) =>
    expect(audienceSentence(who, rows, '10')).toBe(line),
  );
});
