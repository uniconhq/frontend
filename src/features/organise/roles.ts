import type { At } from '@/api/place';
import type { RoleName } from '@/api/types';

/** Each role's name, as a page shows it. */
export const ROLE_LABEL: Record<RoleName, string> = {
  admin: 'Admin',
  manager: 'Manager',
  observer: 'Observer',
};

/** What a role adds over the one below it, at each kind of place: the forge's checks. */
const ADDS: Record<RolePlace['kind'], Record<RoleName, readonly string[]>> = {
  org: {
    observer: ['See everything here, without changing anything.'],
    manager: [
      'Make contests.',
      'Do everything a contest manager can, in every contest.',
      'Invite people, and give or take the manager and observer roles.',
    ],
    admin: ['Change the org’s details.', 'Give or take the admin role.'],
  },
  contest: {
    observer: ['See everything here, without changing anything.'],
    manager: [
      'Change the schedule, teams, tasks and leaderboards.',
      'Build, publish and rejudge tasks.',
      'Give marks and release results.',
      'Approve and manage entrants.',
      'Post announcements and answer questions.',
      'Freeze and unfreeze the leaderboards.',
      'Invite people, and give or take the manager and observer roles.',
    ],
    admin: [
      'Change the contest’s name and description.',
      'Open the contest, put it back to draft, and archive it.',
      'Choose who sees it and how people enter.',
      'Give or take the admin role.',
    ],
  },
  task: {
    observer: ['See everything here, without changing anything.'],
    manager: [
      'Build, publish and rejudge the task.',
      'Give marks and release results.',
      'Post announcements.',
      'Invite people, and give or take the manager and observer roles.',
    ],
    admin: [
      'Change the task’s title and submission limits.',
      'Give or take the admin role.',
    ],
  },
};

const BELOW: Record<RoleName, RoleName | null> = {
  admin: 'manager',
  manager: 'observer',
  observer: null,
};

/** What a role can do at a kind of place: the role below it, then what it adds. */
export function roleAbilities(role: RoleName, kind: RolePlace['kind']) {
  return { below: BELOW[role], adds: ADDS[kind][role] };
}

/** An org, a contest or a task, the three places a role is held at. */
export type RolePlace = At<'org' | 'contest' | 'task'>;
