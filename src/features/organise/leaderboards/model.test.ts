import { describe, expect, it } from 'vitest';
import { specCatalogue } from '@/test/catalogue';
import { copyOf, type Values } from '../forms/values';
import {
  audienceSentence,
  blankBoard,
  boardReadings,
  commit,
  givenValues,
  hourBefore,
  keyFromName,
  lineOf,
  previewRows,
  problems,
  readLeaderboards,
  withBoardName,
  writeHold,
  writeLeaderboards,
  type BoardDraft,
  type HoldDraft,
  type LeaderboardsDraft,
  type TaskGives,
} from './model';

const catalogue = specCatalogue();

const CONTEST: Values = {
  name: 'Spring',
  start: '2030-10-01T09:00:00Z',
  end: '2030-10-01T14:00:00Z',
  tasks: [{ id: 'islands' }],
};

const OFF: HoldDraft = {
  locked: false,
  on: false,
  from: '',
  untilStaff: true,
  until: '',
};

function read(values: Values): LeaderboardsDraft {
  const draft = readLeaderboards(values);
  if (draft === null) throw new Error('the leaderboards do not read');
  return draft;
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

/** The values a save of `after` over `values`, read as `before`, sends, as the server takes them. */
function saved(
  values: Values,
  after: LeaderboardsDraft,
  before: LeaderboardsDraft = read(values),
): Values {
  const fresh = copyOf(values);
  writeLeaderboards(fresh, before, after);
  writeHold(fresh, before, after);
  return JSON.parse(JSON.stringify(fresh)) as Values;
}

describe('leaderboards written into the values', () => {
  it('writes and reads a column with decimals', () => {
    const next = commit(
      {
        boards: [
          board({ key: 'standings', display: [{ name: 'points', decimals: '2' }] }),
        ],
        hold: OFF,
      },
      catalogue,
      ['islands'],
      {},
    );
    const values = saved(CONTEST, next);
    expect(values['leaderboards']).toEqual([
      {
        key: 'standings',
        columns: [{ name: 'points', formula: 1 }],
        sort: [{ points: 'desc' }],
        display: [{ points: { decimals: 2 } }],
      },
    ]);
    expect(read(values).boards[0]?.display).toEqual([
      { name: 'points', decimals: '2' },
    ]);
  });

  it('writes the gradebook, the olympiad, ICPC and a hold', () => {
    const end = new Date('2030-10-01T14:00:00Z').getTime();
    const from = hourBefore('2030-10-01T14:00:00Z');
    const next = commit(
      {
        boards: [
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
            rows: 'top',
            top: '3',
            columns: [
              { key: 's', name: 'solved', line: null, tree: '1' },
              { key: 'p', name: 'penalty', line: null, tree: '1' },
            ],
            sort: [
              { name: 'solved', way: 'desc' },
              { name: 'penalty', way: 'asc' },
            ],
            display: [],
          }),
        ],
        hold: { locked: false, on: true, from, untilStaff: true, until: '' },
      },
      catalogue,
      ['islands'],
      {},
    );
    const values = saved(CONTEST, next);
    const [gradebook, olympiad, icpc] = values['leaderboards'] as Values[];
    expect(gradebook).toMatchObject({
      key: 'gradebook',
      title: 'Course gradebook',
      audience: { who: 'entrants', rows: 'own' },
    });
    expect(olympiad).toMatchObject({
      title: 'Olympiad',
      audience: { who: 'everyone' },
    });
    expect(icpc).toEqual({
      key: 'icpc',
      title: 'ICPC',
      audience: { who: 'everyone', rows: 3 },
      columns: [
        { name: 'solved', formula: 1 },
        { name: 'penalty', formula: 1 },
      ],
      sort: [{ solved: 'desc' }, { penalty: 'asc' }],
    });
    const hold = values['hold'] as Values;
    expect(hold['until']).toBe('staff');
    expect(new Date(hold['from'] as string).getTime()).toBe(end - 60 * 60 * 1000);
  });

  it('keeps a board left as it was as read and a key the form does not edit, and renames a board and a column in place', () => {
    const values: Values = {
      ...CONTEST,
      leaderboards: [
        {
          key: 'gradebook',
          audience: { who: 'staff' },
          columns: [
            { name: 'points', formula: 1 },
            { name: 'bonus', formula: 2 },
          ],
          sort: [{ points: 'desc' }],
          colour: 'red',
        },
        { key: 'olympiad', columns: [{ name: 'total', formula: 3 }] },
      ],
    };
    const before = read(values);
    const [gradebook, olympiad] = before.boards;
    if (gradebook === undefined || olympiad === undefined) throw new Error('no boards');
    const after = {
      ...before,
      boards: [
        {
          ...gradebook,
          columns: gradebook.columns.map((column) =>
            column.name === 'points' ? { ...column, name: 'score' } : column,
          ),
          sort: [{ name: 'score', way: 'desc' as const }],
        },
        { ...olympiad, key: 'olympiad_2026' },
      ],
    };
    expect(saved(values, after, before)['leaderboards']).toEqual([
      {
        key: 'gradebook',
        audience: { who: 'staff' },
        columns: [
          { name: 'score', formula: 1 },
          { name: 'bonus', formula: 2 },
        ],
        colour: 'red',
        sort: [{ score: 'desc' }],
      },
      { key: 'olympiad_2026', columns: [{ name: 'total', formula: 3 }] },
    ]);
    const renamed = {
      ...before,
      boards: [gradebook, { ...olympiad, title: 'Olympiad' }],
    };
    expect((saved(values, renamed, before)['leaderboards'] as Values[])[0]).toEqual(
      (values['leaderboards'] as Values[])[0],
    );
  });

  it('removes the leaderboards once the last one goes, and leaves the values be when nothing changed', () => {
    const values: Values = {
      ...CONTEST,
      leaderboards: [{ key: 'one', columns: [{ name: 'points', formula: 1 }] }],
    };
    const before = read(values);
    expect(saved(values, { ...before, boards: [] }, before)).toEqual(CONTEST);
    expect(saved(values, before, before)).toEqual(values);
  });

  it('sends a column with no name or no formula, and a hold with no times, as they are', () => {
    const values = saved(CONTEST, {
      boards: [
        board({
          key: 'a',
          columns: [
            { key: 'x', name: '', line: null, tree: '1' },
            { key: 'y', name: 'rest', line: null, tree: null },
            { key: 'z', name: 'rest', line: null, tree: '2' },
          ],
          sort: [],
          display: [],
        }),
        board({ key: 'a' }),
      ],
      hold: { ...OFF, on: true, untilStaff: false },
    });
    const [first, second] = values['leaderboards'] as Values[];
    expect(first?.['columns']).toEqual([
      { name: '', formula: 1 },
      { name: 'rest' },
      { name: 'rest', formula: 2 },
    ]);
    expect(second?.['key']).toBe('a');
    expect(values['hold']).toEqual({});
  });

  it('reads leaderboards or columns not given as named lists as unreadable', () => {
    expect(readLeaderboards({ leaderboards: { a: { columns: {} } } })).toBeNull();
    expect(
      readLeaderboards({ leaderboards: [{ key: 'a', columns: { points: 1 } }] }),
    ).toBeNull();
    expect(readLeaderboards({ name: 'Spring' })?.boards).toEqual([]);
  });
});

/**
 * The forge's Kaggle contest (forge tests/services/test_examples.py): the
 * task house-prices and its public and private leaderboards.
 */
const HOUSE_PRICES: Values = {
  name: 'House prices',
  scoring: {
    values: [
      {
        name: 'public',
        formula: {
          block: 'max',
          over: { runs: 'public_split' },
          of: { run: ['public_split', 'rmse'] },
        },
      },
      {
        name: 'private',
        formula: {
          block: 'max',
          over: { runs: 'private_split' },
          of: { run: ['private_split', 'rmse'] },
        },
      },
    ],
  },
};
const KAGGLE: Values = {
  name: 'Kaggle',
  tasks: [{ id: 'house-prices', marks: 2 }],
  leaderboards: [
    {
      key: 'public_leaderboard',
      title: 'Public',
      audience: { who: 'everyone' },
      columns: [
        {
          name: 'pub',
          formula: {
            block: 'lowest',
            from: { results: 'house-prices' },
            by: { value: ['house-prices', 'public'] },
            missing: 'skip',
          },
        },
        { name: 'public', formula: { value: [{ column: 'pub' }, 'public'] } },
        { name: 'public_at', formula: { value: [{ column: 'pub' }, 'seconds'] } },
      ],
      sort: [{ public: 'asc' }, { public_at: 'asc' }],
      display: ['public', 'public_at'],
    },
    {
      key: 'private_leaderboard',
      title: 'Private',
      audience: { who: 'everyone' },
      columns: [
        {
          name: 'pick',
          formula: {
            block: 'otherwise',
            of: [
              {
                block: 'lowest',
                from: { results: 'house-prices' },
                by: { value: ['house-prices', 'private'] },
                where: { value: ['house-prices', 'marked'] },
                missing: 'skip',
              },
              {
                block: 'lowest',
                from: { results: 'house-prices' },
                by: { value: ['house-prices', 'public'] },
                missing: 'skip',
              },
            ],
          },
        },
        { name: 'private', formula: { value: [{ column: 'pick' }, 'private'] } },
        { name: 'at', formula: { value: [{ column: 'pick' }, 'seconds'] } },
      ],
      sort: [{ private: 'asc' }, { at: 'asc' }],
      display: ['private', 'at'],
    },
  ],
};

describe('a name with a -', () => {
  const tasks = ['house-prices'];
  const gives = { 'house-prices': givenValues(HOUSE_PRICES, new Set()) };

  it('prints the Kaggle contest with each - as _, and reads it back to the same trees', () => {
    const { boards } = read(KAGGLE);
    const [pub, priv] = boards;
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
    for (const one of boards) {
      const readings = boardReadings(one, boards, tasks, gives, catalogue);
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
    const one = { boards: [own, rival], hold: OFF };
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
const LAST: Values = {
  name: 'Spring',
  tasks: [{ id: 'islands' }],
  leaderboards: [
    {
      key: 'one',
      columns: [
        { name: 'last', formula: { block: 'latest', from: { results: 'islands' } } },
        {
          name: 'total',
          formula: { block: 'otherwise', of: [{ value: ['last', 'total'] }, -1] },
        },
      ],
      display: ['total'],
    },
    {
      key: 'two',
      columns: [
        {
          name: 'total',
          formula: {
            block: 'otherwise',
            of: [{ value: [{ column: ['one', 'last'] }, 'score'] }, -1],
          },
        },
      ],
      display: ['total'],
    },
  ],
};

describe('a column of another leaderboard', () => {
  const tasks = ['islands'];
  const gives = {
    islands: [
      { name: 'total', text: false },
      { name: 'score', text: false },
    ],
  };

  it('reads a value off its pick column back to the tree it was printed from', () => {
    const { boards } = read(LAST);
    const two = boards[1];
    if (two === undefined) throw new Error('no second leaderboard');
    const [total] = two.columns;
    if (total === undefined) throw new Error('no column');
    expect(lineOf(total, catalogue)).toBe('otherwise(one.last.score, -1)');
    const reading = boardReadings(two, boards, tasks, gives, catalogue)[total.key];
    expect(reading?.problems).toEqual([]);
    expect(reading?.tree).toEqual(total.tree);
  });

  it('says when that leaderboard has no such column', () => {
    const { boards } = read(LAST);
    const two = boards[1];
    if (two === undefined) throw new Error('no second leaderboard');
    const typed = {
      ...two,
      columns: two.columns.map((column) => ({ ...column, line: 'one.first.score' })),
    };
    const [total] = typed.columns;
    if (total === undefined) throw new Error('no column');
    const reading = boardReadings(typed, boards, tasks, gives, catalogue)[total.key];
    expect(reading?.problems.map((problem) => problem.message)).toEqual([
      'one has no column first',
    ]);
  });
});

describe('what the editor refuses', () => {
  function found(boards: BoardDraft[], hold = OFF) {
    return problems({ boards, hold }, catalogue, ['islands'], {});
  }

  it('leaves names, keys, empty formulas, the hold and every other rule to the save', () => {
    expect(
      found(
        [
          board({ key: 'islands', who: 'everyone', rows: 'own', columns: [] }),
          board({
            key: 'notes',
            columns: [
              { key: 'c', name: 'Note', line: '"hi"', tree: null },
              { key: 'd', name: 'Note', line: '', tree: null },
              { key: 'e', name: '', line: null, tree: '1' },
            ],
            sort: [
              { name: 'Note', way: 'desc' },
              { name: 'gone', way: 'asc' },
            ],
            display: [{ name: 'Note', decimals: '11' }],
          }),
          board({ key: 'notes' }),
        ],
        { ...OFF, on: true, untilStaff: false },
      ),
    ).toEqual([]);
  });

  it('refuses a formula line it cannot read, on its column', () => {
    expect(
      found([
        board({
          key: 'a',
          columns: [{ key: 'c', name: 'points', line: 'max(', tree: null }],
        }),
      ]).map((item) => item.field),
    ).toEqual(['a.columns.points']);
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

  it('is unknown, not a task with no values, when its settings cannot be read', () => {
    expect(givenValues(null, new Set())).toBeNull();
    expect(givenValues({ name: 'Islands' }, new Set())).toEqual([]);
  });

  it('takes which values give text from the form, and does not guess from a formula', () => {
    const medal = {
      name: 'Islands',
      scoring: { values: [{ name: 'medal', formula: { text: 'gold' } }] },
    };
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
      { boards: [board({ key: 'one', columns: [column] })], hold: OFF },
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
