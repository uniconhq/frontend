import { describe, expect, it } from 'vitest';
import {
  domainsOf,
  newSignup,
  readWays,
  registrationSentence,
  writeWays,
  type WayValues,
} from './ways';

describe('the ways into a contest', () => {
  it('reads each way, none written as null, and a list it cannot show as unreadable', () => {
    expect(readWays({ name: 'x' })).toBeNull();
    expect(
      readWays({
        registration: {
          ways: [
            { invite: { approval: 'manual' } },
            {
              signup: { name: 'NUS', domains: ['u.nus.edu', 'nus.edu.sg'], code: 'c' },
            },
          ],
        },
      }),
    ).toEqual([
      { kind: 'invite', approval: 'manual' },
      newSignup({ name: 'NUS', domains: 'u.nus.edu, nus.edu.sg', code: 'c' }),
    ]);
    expect(readWays({ registration: { ways: 'open' } })).toBe('unreadable');
    expect(readWays({ registration: { ways: [{ door: {} }] } })).toBe('unreadable');
  });

  it('writes the ways it changed with only what is set, and none back to the default', () => {
    const values = { name: 'x', registration: { capacity: 5 } };
    writeWays(values, null, [
      { kind: 'invite', approval: '' },
      newSignup({ domains: 'u.nus.edu  comp.nus.edu', approval: 'auto' }),
    ]);
    expect(values).toEqual({
      name: 'x',
      registration: {
        capacity: 5,
        ways: [
          { invite: {} },
          { signup: { domains: ['u.nus.edu', 'comp.nus.edu'], approval: 'auto' } },
        ],
      },
    });
    writeWays(values, [], null);
    expect(values).toEqual({ name: 'x', registration: { capacity: 5 } });
    const only = { registration: { ways: [{ invite: {} }] } };
    writeWays(only, [{ kind: 'invite', approval: '' }], null);
    expect(only).toEqual({});
  });

  it('takes the domains as typed, split at spaces, commas and semicolons', () => {
    expect(domainsOf(' @U.NUS.edu, u.nus.edu;u.nus.edu ')).toEqual([
      '@U.NUS.edu',
      'u.nus.edu',
      'u.nus.edu',
    ]);
  });

  /** Who one way lets in, as the registration sentence starts. */
  const whoWords = (way: WayValues) => {
    const sentence = registrationSentence({
      ways: [way],
      opens: '',
      closes: '',
      capacity: '',
    });
    const who = sentence.slice(0, sentence.indexOf(' can register'));
    return who.charAt(0).toLowerCase() + who.slice(1);
  };

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
