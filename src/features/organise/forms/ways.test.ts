import { describe, expect, it } from 'vitest';
import { newBoard } from './board-values';
import { boardSentence } from './board-words';
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
      '“nus” is not a domain. Write one such as u.nus.edu.',
    ]);
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

describe('a board in a sentence', () => {
  it('says the default board, seen by organisers only', () => {
    expect(boardSentence({ ...newBoard(), name: 'Standings' })).toBe(
      'Ranks entrants by points, from each entrant’s best submission on every task, counting every result once it is shown. Only organisers see it.',
    );
  });

  it('says the keys in turn, the tasks, the results counted and the rows shown', () => {
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
      'Ranks entrants by points and the minute its counted submission was made, from the best submission on each test group on tasks sum and sort, counting only the results shown during the contest. Everyone who can see the contest sees it, the top 10 rows, every row tied with the last of them, and each entrant’s own row.',
    );
  });
});
