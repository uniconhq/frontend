import type { ScopeNames } from '@/api/types';
import { useSession } from './session-context';

function useNamed(
  pick: (names: ScopeNames) => string | null,
  kind: 'contests' | 'tasks',
) {
  const session = useSession();
  if (session.status !== 'signed-in') return [];
  return session.me[kind].flatMap((names) => {
    const name = pick(names);
    return name === null ? [] : [name];
  });
}

/** The contests of `org` that `me` names, for when the org's list is refused. */
export function useNamedContests(org: string): string[] {
  return useNamed((names) => (names.org === org ? names.contest : null), 'contests');
}

/** The tasks of a contest that `me` names, for when its list is refused. */
export function useNamedTasks(org: string, contest: string): string[] {
  return useNamed(
    (names) => (names.org === org && names.contest === contest ? names.task : null),
    'tasks',
  );
}
