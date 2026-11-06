import type { At } from '@/api/place';
import type { RoleName } from '@/api/types';

/** Each role's name, as a page shows it. */
export const ROLE_LABEL: Record<RoleName, string> = {
  admin: 'Admin',
  manager: 'Manager',
  observer: 'Observer',
};

/** What each role lets its holder do, under a choice of role. */
export const ROLE_AREAS = [
  'Change settings',
  'Publish',
  'Manage entrants',
  'Give roles',
] as const;
const ROLE_MEANS: Record<RoleName, readonly string[]> = {
  admin: [
    'Change every setting.',
    'Publish changes.',
    'Manage entrants and approve registrations.',
    'Give or take every role, including admin.',
  ],
  manager: [
    'Change grading and schedule settings.',
    'Publish changes.',
    'Manage entrants and approve registrations.',
    'Give or take manager and observer roles.',
  ],
  observer: [
    'Read settings without changing them.',
    'Read publications without publishing.',
    'Read entrants without changing them.',
    'Read roles without giving or taking them.',
  ],
};

/** A task role never reaches the contest's entrants. */
export function roleMeans(role: RoleName, kind: RolePlace['kind']): readonly string[] {
  return ROLE_MEANS[role].map((line, index) =>
    kind === 'task' && index === 2 ? 'Entrants are managed at contest level.' : line,
  );
}

/** An org, a contest or a task, the three places a role is held at. */
export type RolePlace = At<'org' | 'contest' | 'task'>;
