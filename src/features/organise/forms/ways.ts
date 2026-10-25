import { formatDateTime } from '@/lib/time';
import { isRecord, nodeFor, textOf, valueAt, writeAt, type Doc } from './yaml-doc';

/**
 * The ways people may register for a contest (`registration.ways`), as the
 * How people enter page holds them: any one way is enough, and everything a
 * way asks must hold. A way is an invite, the people an organiser invited,
 * or a sign-up, with any of a code, email domains and an email pattern.
 * Each says whether an organiser approves who comes in by it, or `''` for
 * its default: straight away for an invite, an organiser for a sign-up.
 */
export type WayValues =
  | { kind: 'invite'; approval: string }
  | {
      kind: 'signup';
      approval: string;
      name: string;
      code: string;
      /** The domains, one per line or separated by commas, as typed. */
      domains: string;
      emailPattern: string;
    };

export function newSignup(more: Partial<Extract<WayValues, { kind: 'signup' }>> = {}) {
  return {
    kind: 'signup' as const,
    approval: '',
    name: '',
    code: '',
    domains: '',
    emailPattern: '',
    ...more,
  };
}

/** The ways a contest without a `ways` key has: one sign-up, open to anyone, approved by hand. */
export const DEFAULT_WAYS: WayValues[] = [newSignup()];

/**
 * The ways the file holds, `null` for none at all (the default), or
 * `'unreadable'` for a list the page cannot show.
 */
export function readWays(doc: Doc): WayValues[] | null | 'unreadable' {
  const ways = valueAt(doc, ['registration', 'ways']);
  if (ways === undefined) return null;
  if (!Array.isArray(ways)) return 'unreadable';
  const read: WayValues[] = [];
  for (const way of ways) {
    if (!isRecord(way)) return 'unreadable';
    const keys = Object.keys(way);
    if (keys.length !== 1) return 'unreadable';
    const body = way['invite'] ?? way['signup'];
    const settings = body === null || body === undefined ? {} : body;
    if (!isRecord(settings)) return 'unreadable';
    if ('invite' in way) {
      read.push({ kind: 'invite', approval: textOf(settings['approval']) });
      continue;
    }
    if (!('signup' in way)) return 'unreadable';
    const domains = settings['domains'];
    if (domains !== undefined && !Array.isArray(domains)) return 'unreadable';
    read.push(
      newSignup({
        approval: textOf(settings['approval']),
        name: textOf(settings['name']),
        code: textOf(settings['code']),
        domains: (domains ?? []).map(textOf).join(', '),
        emailPattern: textOf(settings['email_pattern']),
      }),
    );
  }
  return read;
}

/** The domains typed into a sign-up, each once, lower case, without an `@` before it. */
export function domainsOf(typed: string): string[] {
  const found = typed
    .split(/[\s,;]+/)
    .map((domain) => domain.trim().replace(/^@/, '').toLowerCase())
    .filter((domain) => domain !== '');
  return [...new Set(found)];
}

/** What starts a domain that takes itself and every domain under it (#439). */
const UNDER = '*.';

/**
 * A domain as the forge takes it: two or more labels of lower-case letters,
 * digits and hyphens joined by dots, none starting or ending with a hyphen,
 * after an optional `*.` standing as the whole first label.
 */
const DOMAIN =
  /^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** A way as the file holds it, with only what is set. */
function wayItem(way: WayValues): Record<string, unknown> {
  const approval = way.approval === '' ? {} : { approval: way.approval };
  if (way.kind === 'invite') return { invite: approval };
  const domains = domainsOf(way.domains);
  return {
    signup: {
      ...(way.name.trim() !== '' && { name: way.name.trim() }),
      ...(way.code.trim() !== '' && { code: way.code.trim() }),
      ...(domains.length > 0 && { domains }),
      ...(way.emailPattern.trim() !== '' && { email_pattern: way.emailPattern.trim() }),
      ...approval,
    },
  };
}

/**
 * Write the ways when they changed: the whole list at once, since a way's
 * place in it is all that names it, or no key for the default.
 */
export function writeWays(
  doc: Doc,
  before: WayValues[] | null,
  after: WayValues[] | null,
): void {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  if (after === null) {
    writeAt(doc, ['registration', 'ways'], undefined, { prune: true });
    return;
  }
  writeAt(doc, ['registration', 'ways'], []);
  doc.setIn(['registration', 'ways'], nodeFor(doc, after.map(wayItem)));
}

/** What is wrong with a way as typed, or nothing. */
export function wayProblems(ways: WayValues[]): string[] {
  const problems: string[] = [];
  if (ways.filter((way) => way.kind === 'invite').length > 1) {
    problems.push(
      'There is already a way in by invite, and a contest has at most one.',
    );
  }
  const names = ways
    .filter(
      (way): way is Extract<WayValues, { kind: 'signup' }> => way.kind === 'signup',
    )
    .map((way) => way.name.trim().toLowerCase())
    .filter((name) => name !== '');
  if (new Set(names).size !== names.length) {
    problems.push('Two sign-ups have the same name.');
  }
  for (const way of ways) {
    if (way.kind !== 'signup') continue;
    for (const domain of domainsOf(way.domains)) {
      if (!DOMAIN.test(domain)) {
        problems.push(
          `“${domain}” is not a domain. Write one such as u.nus.edu, or ${UNDER}nus.edu.sg to take nus.edu.sg and every domain under it.`,
        );
      }
    }
  }
  return problems;
}

/** Whether a way's people are approved straight away. */
export function approvesAtOnce(way: WayValues): boolean {
  if (way.approval === 'auto') return true;
  if (way.approval === 'manual') return false;
  return way.kind === 'invite';
}

/** Who a way lets in, in a few words: "anyone with an @u.nus.edu email and the code". */
function whoWords(way: WayValues): string {
  if (way.kind === 'invite') return 'anyone you invite';
  const domains = domainsOf(way.domains);
  const pattern = way.emailPattern.trim() !== '';
  const exact = domains.filter((domain) => !domain.startsWith(UNDER));
  const atOrUnder = [
    ...(exact.length > 0
      ? [`an ${exact.map((domain) => `@${domain}`).join(' or ')} email`]
      : []),
    ...domains
      .filter((domain) => domain.startsWith(UNDER))
      .map(
        (domain) => `an email at ${domain.slice(UNDER.length)} or any domain under it`,
      ),
  ];
  // A comma keeps "or any domain under it" from taking what follows as its own.
  const comma =
    (atOrUnder.length > 1 || exact.length === 0) && (pattern || way.code.trim() !== '');
  // The same confirmed address must be at a domain and match the pattern.
  const conditions = [
    ...(atOrUnder.length > 0
      ? [
          `${atOrUnder.join(', or ')}${comma ? ',' : ''}${pattern ? ' matching the pattern' : ''}`,
        ]
      : pattern
        ? ['an email address matching the pattern']
        : []),
    ...(way.code.trim() !== '' ? ['the code'] : []),
  ];
  return conditions.length === 0
    ? 'anyone with an account'
    : `anyone with ${conditions.join(' and ')}`;
}

/**
 * What the registration settings add up to, as one plain paragraph: who can
 * register, from when until when, who approves them, and how many may.
 */
export function registrationSentence({
  ways,
  opens,
  closes,
  capacity,
}: {
  ways: WayValues[] | null;
  /** Times as the form holds them, in the organiser's own time, or empty. */
  opens: string;
  closes: string;
  capacity: string;
}): string {
  const list = ways ?? DEFAULT_WAYS;
  if (list.length === 0) return 'Nobody can register: the contest has no way in.';
  const who = [...new Set(list.map(whoWords))];
  const first = who.join(', or ');
  const start = first.charAt(0).toUpperCase() + first.slice(1);
  const from =
    opens === ''
      ? 'from when the contest opens'
      : `from ${formatDateTime(new Date(opens))}`;
  const until =
    closes === ''
      ? 'until the contest ends'
      : `until ${formatDateTime(new Date(closes))}`;
  const quick = list.map(approvesAtOnce);
  const approval = quick.every(Boolean)
    ? 'Each is approved straight away.'
    : quick.some(Boolean)
      ? 'Some are approved straight away and others by an organiser, as each way says.'
      : 'An organiser approves each one.';
  const most =
    capacity.trim() === '' ? '' : ` At most ${capacity.trim()} entrants can register.`;
  return `${start} can register ${from} ${until}. ${approval}${most}`;
}
