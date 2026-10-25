import { describe, expect, it } from 'vitest';
import { specCatalogue } from '../formula/catalogue';
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
    who: 'staff',
    rows: 'all',
    top: '10',
    columns: [{ key: 'c', name: 'points', line: null, tree: '1' }],
    sort: [{ name: 'points', way: 'desc' }],
    display: [{ name: 'points', places: '' }],
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
            { name: 'score', places: '' },
            { name: 'bonus', places: '' },
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
      display: [{ name: 'top-score', places: '' }],
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
    expect(
      problems(
        one,
        catalogue,
        tasks,
        gives,
        0,
        '2030-10-01T09:00:00Z',
        '2030-10-01T14:00:00Z',
      ),
    ).toEqual([]);
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
  const now = new Date('2026-10-25T00:00:00Z').getTime();

  function found(
    over: Partial<BoardDraft> & Pick<BoardDraft, 'key'>,
    tasks = ['islands'],
  ) {
    const doc = open(FILE);
    const one = draft(doc, [board(over)], {
      locked: false,
      on: false,
      from: '',
      untilStaff: true,
      until: '',
    });
    return problems(
      one,
      catalogue,
      tasks,
      {},
      now,
      '2030-10-01T09:00:00Z',
      '2030-10-01T14:00:00Z',
    );
  }

  it('refuses a key the save would refuse', () => {
    expect(
      found({ key: 'a'.repeat(25) })
        .map((item) => item.message)
        .join(' '),
    ).toMatch(/24/);
    expect(
      found({ key: 'islands' })
        .map((item) => item.message)
        .join(' '),
    ).toMatch(/tasks and leaderboards share one set of names/);
    expect(found({ key: 'and' }).map((item) => item.message)).toContain(
      "and is a word a formula reads as an operator, so it can't name a value. " +
        'Choose another name.',
    );
    expect(
      found({ key: 'house_prices' }, ['house-prices']).map((item) => item.message),
    ).toContain(
      'house_prices reads as house-prices in a formula, where each - is written _. ' +
        'Name the leaderboard otherwise.',
    );
  });

  it('takes a - in a column name, and refuses one that reads as another name', () => {
    const named = (name: string, tasks = ['islands']) =>
      found(
        {
          key: 'board',
          columns: [
            { key: 'a', name, line: null, tree: '1' },
            { key: 'b', name: 'points', line: null, tree: '1' },
          ],
        },
        tasks,
      ).map((item) => item.message);
    expect(named('best-run')).toEqual([]);
    expect(named('house_prices', ['house-prices'])).toContain(
      'house_prices reads as house-prices in a formula, where each - is written _. ' +
        'Name the column otherwise.',
    );
    expect(named('or').join(' ')).toMatch(/operator/);
    expect(named('Best').join(' ')).toMatch(/hyphens/);
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
    expect(
      pick.some(
        (item) => item.field === 'latest.display' && item.message.includes('pick'),
      ),
    ).toBe(true);
    expect(
      pick.some(
        (item) => item.field === 'latest.sort' && item.message.includes('pick'),
      ),
    ).toBe(true);
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
        {},
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
      problems(
        one,
        catalogue,
        [],
        {},
        now,
        '2030-10-01T09:00:00Z',
        '2030-10-01T14:00:00Z',
      ).some((item) => item.field === 'hold.from'),
    ).toBe(true);
  });

  it('keeps a stored hold that has since started, and refuses moving it into the past', () => {
    const later = new Date('2031-01-01T00:00:00Z').getTime();
    const hold = {
      locked: false,
      on: true,
      from: '2030-10-01T12:00',
      untilStaff: true,
      until: '',
    };
    const fromOf = (moved: typeof hold) =>
      problems(
        draft(open(FILE), [], moved),
        catalogue,
        [],
        {},
        later,
        '2030-11-01T09:00:00Z',
        '2030-11-01T14:00:00Z',
        hold,
      ).filter((item) => item.field === 'hold.from');
    expect(fromOf(hold)).toEqual([]);
    expect(fromOf({ ...hold, from: '2030-10-01T12:30' }).length).toBeGreaterThan(0);
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
  const now = new Date('2026-10-25T00:00:00Z').getTime();
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
      now,
      '2030-10-01T09:00:00Z',
      '2030-10-01T14:00:00Z',
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
