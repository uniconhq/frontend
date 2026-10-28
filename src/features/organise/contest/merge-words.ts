import type { MergePath } from '../forms/merge';
import { NumberText } from '../forms/yaml-doc';
import { BOARD_PARTS, TASK_FIELDS } from './places';

/**
 * The contest's settings in words for the merge of two saves (M27): each
 * setting named as its page names it, a task and a board by their names,
 * and each value as the pages say it, never as the settings file holds it.
 */

const TOP: Record<string, string> = {
  name: 'Name',
  description: 'Description',
  start: 'Start',
  end: 'End',
  state: 'Open, draft or archived',
  visibility: 'Who sees it',
  registration: 'How people enter',
  entrants: 'Teams',
  tasks: 'Tasks',
  leaderboards: 'Leaderboards',
};

const UNDER: Record<string, Record<string, string>> = {
  registration: {
    opens: 'Registration opens',
    closes: 'Registration closes',
    capacity: 'Most entrants',
    ways: 'Ways in',
  },
  entrants: {
    most: 'Most people in a team',
    fewest: 'Fewest people in a team',
    locks: 'Teams are fixed',
  },
};

const VALUES: Record<string, Record<string, string>> = {
  state: { draft: 'Draft', published: 'Open', archived: 'Archived' },
  visibility: {
    everyone: 'Anyone, signed in or not',
    'signed-in': 'Anyone signed in',
    hidden: 'Only its entrants and organisers',
  },
  locks: {
    start: 'When the contest starts',
    first_submission: 'At a team’s first submission',
  },
  who: { staff: 'Organisers only', entrants: 'Entrants', everyone: 'Anyone' },
  approval: { auto: 'Approved straight away', manual: 'An organiser approves' },
};

/** Words for a key alone, where no page names it: `release_at` is "Release at". */
function plain(key: string): string {
  const words = key.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A setting of the contest named in words: "Task sum: Due", "Leaderboard Standings: Shown to". */
export function contestFieldName(path: MergePath): string {
  const [top, second, third] = path;
  if (typeof top !== 'string') return 'The settings';
  if (top === 'tasks' && second !== undefined && typeof second !== 'string') {
    const task = `Task ${second.value}`;
    return typeof third === 'string'
      ? `${task}: ${TASK_FIELDS[third] ?? plain(third)}`
      : task;
  }
  if (top === 'leaderboards' && typeof second === 'string') {
    const board = `Leaderboard ${second}`;
    return typeof third === 'string'
      ? `${board}: ${BOARD_PARTS[third] ?? plain(third)}`
      : board;
  }
  if (top === 'hold') {
    return typeof second === 'string' ? `Freeze: ${plain(second)}` : 'Freeze';
  }
  if (typeof second === 'string') {
    return UNDER[top]?.[second] ?? `${TOP[top] ?? plain(top)}: ${plain(second)}`;
  }
  return TOP[top] ?? plain(top);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof NumberText)
  );
}

/** A way into the contest in a few words: "Invite", "Sign-up NUS students". */
function wayWords(way: unknown): string {
  if (!isRecord(way)) return '?';
  if ('invite' in way) return 'People you invite';
  const signup = way['signup'];
  const name =
    isRecord(signup) && typeof signup['name'] === 'string' ? signup['name'] : null;
  return name === null ? 'A sign-up' : `Sign-up “${name}”`;
}

/**
 * A value of a contest setting in words, or null where it reads well as it
 * is (a name, a number, a time). `key` is the setting's last key.
 */
export function contestValueWords(path: MergePath, value: unknown): string | null {
  const key = [...path]
    .reverse()
    .find((step): step is string => typeof step === 'string');
  if (key === undefined) return null;
  if (typeof value === 'string') return VALUES[key]?.[value] ?? null;
  if (key === 'ways' && Array.isArray(value)) {
    return value.length === 0 ? 'Nobody' : value.map(wayWords).join(', ');
  }
  if (isRecord(value)) {
    const parts = Object.entries(value).map(([sub, inner]) => {
      const name = contestFieldName([...path, sub]);
      const said =
        contestValueWords([...path, sub], inner) ??
        (inner instanceof NumberText
          ? inner.text
          : typeof inner === 'string' || typeof inner === 'number'
            ? String(inner)
            : Array.isArray(inner)
              ? `${String(inner.length)} set`
              : 'set');
      return `${name.split(': ').at(-1) ?? name}: ${said}`;
    });
    return parts.length === 0 ? 'Nothing set' : parts.join('; ');
  }
  return null;
}
