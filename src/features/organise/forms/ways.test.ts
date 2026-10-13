import { describe, expect, it } from 'vitest';
import { formatDateTime } from '@/lib/time';
import { newBoard } from './board-values';
import { boardSentence, type HeldGroup } from './board-words';
import {
  domainsOf,
  newSignup,
  readWays,
  registrationSentence,
  wayProblems,
  whoWords,
  writeWays,
} from './ways';
import { parseYaml, writeOver } from './yaml-doc';

function docOf(text: string) {
  const parsed = parseYaml(text);
  if ('error' in parsed) throw new Error(parsed.error);
  return parsed.doc;
}

describe('the ways into a contest', () => {
  it('reads each way, none written as null, and a list it cannot show as unreadable', () => {
    expect(readWays(docOf('name: x\n'))).toBeNull();
    expect(
      readWays(
        docOf(
          'registration:\n  ways:\n    - invite: {approval: manual}\n    - signup: {name: NUS, domains: [u.nus.edu, nus.edu.sg], code: c}\n',
        ),
      ),
    ).toEqual([
      { kind: 'invite', approval: 'manual' },
      newSignup({ name: 'NUS', domains: 'u.nus.edu, nus.edu.sg', code: 'c' }),
    ]);
    expect(readWays(docOf('registration:\n  ways: open\n'))).toBe('unreadable');
    expect(readWays(docOf('registration:\n  ways:\n    - door: {}\n'))).toBe(
      'unreadable',
    );
  });

  it('writes the ways it changed with only what is set, and none back to the default', () => {
    const text = 'name: x\nregistration:\n  capacity: 5\n';
    const doc = docOf(text);
    writeWays(doc, null, [
      { kind: 'invite', approval: '' },
      newSignup({ domains: '@U.nus.edu  u.nus.edu', approval: 'auto' }),
    ]);
    expect(writeOver(text, doc)).toBe(
      'name: x\nregistration:\n  capacity: 5\n  ways:\n    - invite: {}\n    - signup:\n        domains:\n          - u.nus.edu\n        approval: auto\n',
    );
    writeWays(doc, [], null);
    expect(writeOver(text, doc)).toBe('name: x\nregistration:\n  capacity: 5\n');
  });

  it('takes domains one each, lower case, without an @', () => {
    expect(domainsOf(' @U.NUS.edu, u.nus.edu;comp.nus.edu.sg ')).toEqual([
      'u.nus.edu',
      'comp.nus.edu.sg',
    ]);
  });

  it('says what will not do: two invite ways, two sign-ups of one name, a domain that is none', () => {
    expect(
      wayProblems([
        { kind: 'invite', approval: '' },
        { kind: 'invite', approval: '' },
        newSignup({ name: 'A' }),
        newSignup({ name: 'a', domains: 'nus' }),
      ]),
    ).toEqual([
      'There is already a way in by invite, and a contest has at most one.',
      'Two sign-ups have the same name.',
      '“nus” is not a domain. Write one such as u.nus.edu, or *.nus.edu.sg to take nus.edu.sg and every domain under it.',
    ]);
  });

  it('takes a domain and every domain under it as the forge does, *. as the whole first part', () => {
    const problems = (domains: string) => wayProblems([newSignup({ domains })]);
    expect(problems('*.nus.edu.sg, u.nus.edu, a-b.c9.org')).toEqual([]);
    expect(problems('*.sg')).toEqual([
      '“*.sg” is not a domain. Write one such as u.nus.edu, or *.nus.edu.sg to take nus.edu.sg and every domain under it.',
    ]);
    for (const domain of [
      '*nus.edu.sg',
      'a.*.edu',
      '*.*.edu.sg',
      '-a.edu',
      'a-.edu',
      'a..edu',
    ]) {
      expect(problems(domain)).toHaveLength(1);
    }
  });

  it('says a domain and every domain under it in words', () => {
    expect(whoWords(newSignup({ domains: '*.nus.edu.sg' }))).toBe(
      'anyone with an email at nus.edu.sg or any domain under it',
    );
    expect(whoWords(newSignup({ domains: 'u.nus.edu, *.nus.edu.sg', code: 'x' }))).toBe(
      'anyone with an @u.nus.edu email, or an email at nus.edu.sg or any domain under it, and the code',
    );
    expect(whoWords(newSignup({ domains: '*.nus.edu.sg', emailPattern: '^e' }))).toBe(
      'anyone with an email at nus.edu.sg or any domain under it, matching the pattern',
    );
  });

  it('says who each way lets in, everything it asks together', () => {
    expect(whoWords({ kind: 'invite', approval: '' })).toBe('anyone you invite');
    expect(whoWords(newSignup())).toBe('anyone with an account');
    expect(whoWords(newSignup({ domains: 'a.edu, b.edu', code: 'x' }))).toBe(
      'anyone with an @a.edu or @b.edu email and the code',
    );
    expect(whoWords(newSignup({ emailPattern: '.*' }))).toBe(
      'anyone with an email address matching the pattern',
    );
    expect(whoWords(newSignup({ domains: 'u.nus.edu', emailPattern: '^e' }))).toBe(
      'anyone with an @u.nus.edu email matching the pattern',
    );
  });

  it('adds it all up in one sentence, and says when nobody can register', () => {
    expect(
      registrationSentence({ ways: [], opens: '', closes: '', capacity: '' }),
    ).toBe('Nobody can register: the contest has no way in.');
    expect(
      registrationSentence({
        ways: [{ kind: 'invite', approval: 'manual' }],
        opens: '',
        closes: '',
        capacity: '20',
      }),
    ).toBe(
      'Anyone you invite can register from when the contest opens until the contest ends. An organiser approves each one. At most 20 entrants can register.',
    );
  });
});

describe('a board in a sentence (M52)', () => {
  /** sum's group "hidden", shown once sum closes with the contest; sort's "final", closing earlier. */
  const held: HeldGroup[] = [
    { task: 'sum', label: 'A', group: 'hidden', closes: null },
    { task: 'sort', label: 'B', group: 'final', closes: '2026-10-03T09:00:00Z' },
  ];

  it('says the default board, seen by organisers only', () => {
    expect(boardSentence({ ...newBoard(), name: 'Standings' })).toBe(
      'Ranks entrants by their total points over every task, most first. Each entrant’s best submission to each task counts. Only organisers see it.',
    );
  });

  it('says the keys in turn, the tasks, the rows shown and what it leaves out, in general when the groups are not known', () => {
    expect(
      boardSentence({
        ...newBoard(),
        tasks: ['sum', 'sort'],
        select: 'best_per_group',
        over: 'live',
        order: [{ kind: 'points' }, { kind: 'penalty', perAttempt: '' }],
        who: 'everyone',
        rows: '10',
      }),
    ).toBe(
      'Ranks entrants by their total points over tasks sum and sort, most first; ties broken by penalty minutes, fewest first. Each entrant’s best result on each test group of each task counts. Organisers see all of it; everyone else who can see the contest sees the top 10 rows and any row tied with the last of them, and an entrant their own row as well. It leaves out every test group whose results entrants see only once its task closes.',
    );
  });

  it('says without the tasks, as how the contest is scored says it of one task, and nothing of when while nothing is held back', () => {
    expect(
      boardSentence({ ...newBoard(), who: 'contestants' }, { tasks: false, held: [] }),
    ).toBe(
      'ranks entrants by their total points over every task, most first. Each entrant’s best submission to this task counts. Entrants and organisers see all of it.',
    );
  });

  it('names a held group that joins it once shown, and when, only where it changes something', () => {
    const board = { ...newBoard(), who: 'contestants' };
    expect(boardSentence(board, { tasks: false, held: held.slice(0, 1) })).toBe(
      'ranks entrants by their total points over every task, most first. Each entrant’s best submission to this task counts. Entrants and organisers see all of it. Results from test group “hidden” join it when the contest ends.',
    );
    expect(boardSentence(board, { held })).toBe(
      `Ranks entrants by their total points over every task, most first. Each entrant’s best submission to each task counts. Entrants and organisers see all of it. Results from test group “hidden” of task A join it when the contest ends. Results from test group “final” of task B join it when task B closes, ${formatDateTime(new Date('2026-10-03T09:00:00Z'))}.`,
    );
  });

  it('names the held groups a board of the results shown during the contest leaves out, of the tasks it covers', () => {
    expect(
      boardSentence(
        {
          ...newBoard(),
          tasks: ['sum'],
          over: 'live',
          who: 'contestants',
          rows: 'own',
        },
        { held },
      ),
    ).toBe(
      'Ranks entrants by their total points over task sum, most first. Each entrant’s best submission to the task counts. Organisers see all of it, and each entrant only their own row. It leaves out test group “hidden”, whose results entrants see only once the task closes.',
    );
  });

  it('names the only groups a board of the results shown once each task closes counts, or that it takes nothing from the one task', () => {
    const board = {
      ...newBoard(),
      over: 'after_close',
      order: [{ kind: 'value' as const, name: 'time', fold: 'max' }],
    };
    expect(boardSentence(board, { tasks: false, held: held.slice(0, 1) })).toBe(
      'ranks entrants by their total time over every task, each task’s highest test, best first. Each entrant’s best submission to this task counts. Only organisers see it. It counts only test group “hidden”, when the contest ends.',
    );
    expect(boardSentence(board, { tasks: false, held: [] })).toBe(
      'ranks entrants by their total time over every task, each task’s highest test, best first. Each entrant’s best submission to this task counts. Only organisers see it. It takes nothing from this task: it counts only test groups whose results entrants see once their task closes, and this task has none.',
    );
    expect(boardSentence(board, { held: [] })).toBe(
      'Ranks entrants by their total time over every task, each task’s highest test, best first. Each entrant’s best submission to each task counts. Only organisers see it. It counts nothing: it counts only test groups whose results entrants see once their task closes, and no task it covers has one.',
    );
  });
});
