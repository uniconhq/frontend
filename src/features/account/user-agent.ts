/**
 * A session row has to be recognisable: is that me on my laptop, or someone
 * else? This is the smallest thing that answers the question. It is not browser
 * detection, and nothing branches on it.
 */
const BROWSERS: [string, RegExp][] = [
  ['Edge', /Edg\//],
  ['Opera', /OPR\//],
  ['Firefox', /Firefox\//],
  ['Chrome', /Chrome\//],
  ['Safari', /Safari\//],
];

const SYSTEMS: [string, RegExp][] = [
  ['Windows', /Windows NT/],
  ['Android', /Android/],
  ['iOS', /iPhone|iPad/],
  ['macOS', /Mac OS X/],
  ['Linux', /Linux/],
];

function firstMatch(candidates: [string, RegExp][], text: string): string | null {
  for (const [name, pattern] of candidates) {
    if (pattern.test(text)) return name;
  }
  return null;
}

export function describeUserAgent(userAgent: string | null): string {
  if (userAgent === null || userAgent.trim() === '') return 'Unknown device';

  const browser = firstMatch(BROWSERS, userAgent);
  const system = firstMatch(SYSTEMS, userAgent);
  if (browser === null && system === null) return userAgent.slice(0, 60);
  return [browser, system].filter((part) => part !== null).join(' on ');
}
