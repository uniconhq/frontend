import { describe, expect, it } from 'vitest';
import { currentPath, loginHref, safeNext } from './login-href';

describe('safeNext', () => {
  it.each([
    ['/account', '/account'],
    ['/c/icpc/finals?tab=tasks#top', '/c/icpc/finals?tab=tasks#top'],
    ['/', '/'],
  ])('keeps %s, a path on this site', (candidate, expected) => {
    expect(safeNext(candidate)).toBe(expected);
  });

  it.each<[string | null, string]>([
    ['//evil.example', 'a protocol-relative URL'],
    ['/\\evil.example', 'a backslash the browser reads as a slash'],
    ['https://evil.example', 'an absolute URL'],
    ['account', 'a bare word, which resolves against the current page'],
    ['/account\nSet-Cookie: x=1', 'a header injection attempt'],
    ['/account\r\n/', 'the same with a carriage return'],
    ['', 'nothing'],
    [null, 'a missing parameter'],
  ])('refuses %s (%s) and lands on the home page', (candidate: string | null) => {
    expect(safeNext(candidate)).toBe('/');
  });
});

describe('loginHref', () => {
  it('encodes the path it is allowed to return to', () => {
    expect(loginHref('/account')).toBe('/api/v1/auth/login?next=%2Faccount');
  });

  it('never hands the backend a next it would have to refuse', () => {
    expect(loginHref('//evil.example')).toBe('/api/v1/auth/login?next=%2F');
  });
});

describe('currentPath', () => {
  it('is the whole address, so a deep link comes back to itself', () => {
    expect(
      currentPath({ pathname: '/account', search: '?tab=sessions', hash: '#top' }),
    ).toBe('/account?tab=sessions#top');
  });

  it('unwraps /login, which is where someone already is on their way out', () => {
    expect(
      currentPath({ pathname: '/login', search: '?next=%2Faccount', hash: '' }),
    ).toBe('/account');
  });

  it('does not let /login smuggle an off-site next through', () => {
    expect(
      currentPath({ pathname: '/login', search: '?next=%2F%2Fevil.example', hash: '' }),
    ).toBe('/');
  });
});
