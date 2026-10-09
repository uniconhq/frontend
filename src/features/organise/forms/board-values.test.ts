import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  boardProblems,
  boardRefusals,
  newBoard,
  readBoards,
  writeBoards,
  type BoardValues,
} from './board-values';
import { parseYaml, valueAt, writeYaml, type Doc } from './yaml-doc';

const FILE = `name: Spring
leaderboards:
  - name: IOI   # the main one
    over: all
  - {name: ICPC, order: [points, {by: penalty, per_attempt: 20}], who: everyone}
`;

function docOf(text: string): Doc {
  const parsed = parseYaml(text);
  if ('error' in parsed) throw new Error(parsed.error);
  return parsed.doc;
}

function boardsOf(doc: Doc): BoardValues[] {
  const boards = readBoards(valueAt(doc, ['leaderboards']));
  if (boards === null) throw new Error('unreadable');
  return boards;
}

describe('a contest’s boards as fields', () => {
  it('reads every key of each board, the defaults left empty', () => {
    expect(boardsOf(docOf(FILE))).toEqual([
      {
        at: 0,
        name: 'IOI',
        tasks: null,
        over: 'all',
        select: '',
        order: [],
        who: '',
        rows: '',
      },
      {
        at: 1,
        name: 'ICPC',
        tasks: null,
        over: '',
        select: '',
        order: [{ kind: 'points' }, { kind: 'penalty', perAttempt: '20' }],
        who: 'everyone',
        rows: '',
      },
    ]);
  });

  it('reads a board it cannot show as fields as no boards at all', () => {
    expect(readBoards([{ name: 'B', order: [{ metric: 'points' }] }])).toBeNull();
    expect(readBoards({ name: 'B' })).toBeNull();
    expect(readBoards(undefined)).toEqual([]);
  });

  it('writes only what changed, keeping the comments and the untouched board', () => {
    const doc = docOf(FILE);
    const before = boardsOf(doc);
    const after: BoardValues[] = [
      { ...before[0]!, rows: '10', who: 'contestants' },
      before[1]!,
      {
        ...newBoard(),
        name: 'Final',
        tasks: ['b'],
        over: 'after_close',
        select: 'marked',
        order: [{ kind: 'points' }, { kind: 'value', name: 'time_ms' }],
      },
    ];

    writeBoards(doc, before, after);
    const text = writeYaml(doc);

    expect(text).toContain('# the main one');
    expect(text).toContain(
      '  - {name: ICPC, order: [points, {by: penalty, per_attempt: 20}], who: everyone}\n',
    );
    expect((parse(text) as { leaderboards: unknown }).leaderboards).toEqual([
      { name: 'IOI', over: 'all', who: 'contestants', rows: 10 },
      {
        name: 'ICPC',
        order: ['points', { by: 'penalty', per_attempt: 20 }],
        who: 'everyone',
      },
      {
        name: 'Final',
        tasks: ['b'],
        over: 'after_close',
        select: 'marked',
        order: ['points', 'time_ms'],
      },
    ]);
  });

  it('writes penalty with no minutes as the word, and an emptied order as no key', () => {
    const doc = docOf(FILE);
    const before = boardsOf(doc);

    writeBoards(doc, before, [
      {
        ...before[0]!,
        order: [{ kind: 'points' }, { kind: 'penalty', perAttempt: '' }],
      },
      { ...before[1]!, order: [] },
    ]);

    expect((parse(writeYaml(doc)) as { leaderboards: unknown }).leaderboards).toEqual([
      { name: 'IOI', over: 'all', order: ['points', 'penalty'] },
      { name: 'ICPC', who: 'everyone' },
    ]);
  });

  it('starts the key when the file has no boards, and drops it with the last', () => {
    const empty = docOf('name: Spring\n');
    writeBoards(empty, [], [{ ...newBoard(), name: 'IOI' }]);
    expect(parse(writeYaml(empty))).toEqual({
      name: 'Spring',
      leaderboards: [{ name: 'IOI', order: ['points'] }],
    });

    const doc = docOf(FILE);
    writeBoards(doc, boardsOf(doc), []);
    expect(parse(writeYaml(doc))).toEqual({ name: 'Spring' });
  });

  it('finds what a refusal says about a board by where under it it points', () => {
    const refusals = boardRefusals(
      [
        {
          path: 'leaderboards[1].order[0]',
          message: 'penalty is never the first key.',
        },
        {
          path: 'leaderboards[1].order[1].per_attempt',
          message: 'Must be at least 0.',
        },
        { path: 'leaderboards[1]', message: 'Two boards are named ICPC.' },
        { path: 'leaderboards[10].name', message: 'Not this board.' },
        { path: 'tasks[1].marks', message: 'Not a board.' },
      ],
      1,
    );

    expect(Object.fromEntries(refusals)).toEqual({
      'order.0': ['penalty is never the first key.'],
      'order.1.per_attempt': ['Must be at least 0.'],
      '': ['Two boards are named ICPC.'],
    });
  });

  it('will not save an unnamed value or minutes that are not whole', () => {
    expect(
      boardProblems({
        ...newBoard(),
        order: [
          { kind: 'value', name: ' ' },
          { kind: 'penalty', perAttempt: '2.5' },
          { kind: 'penalty', perAttempt: '20' },
        ],
      }),
    ).toEqual(['Name the value.', 'A whole number of minutes.']);
  });
});
