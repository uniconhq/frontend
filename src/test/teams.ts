import type { ListedTeam, MyTeams, Team, TeamMember } from '@/api/types';

/**
 * Teams for the tests: people by username, each with a user id the
 * signed-in `kenny` (7) is not, unless the test makes them so, and teams
 * built from them. Every team holds three, the contest's default.
 */
const IDS: Record<string, number> = { kenny: 7, carol: 20, dee: 21, eve: 22, finn: 23 };

export const RED = '0b9d6a52-0000-4000-8000-000000000001';
export const BLUE = '0b9d6a52-0000-4000-8000-000000000002';

export function member(
  username: string,
  overrides: Partial<TeamMember> = {},
): TeamMember {
  const id = IDS[username] ?? 99;
  return {
    user_id: id,
    user: { id, username, name: null, avatar_url: null },
    status: 'member',
    since: '2026-09-12T09:00:00Z',
    ...overrides,
  };
}

export function team(overrides: Partial<Team> = {}): Team {
  return {
    id: RED,
    name: 'Red',
    leader: 20,
    members: [member('carol')],
    pending: [],
    submitted: false,
    ...overrides,
  };
}

export function listed(overrides: Partial<ListedTeam> = {}): ListedTeam {
  return {
    id: RED,
    name: 'Red',
    leader: { id: 20, username: 'carol', name: null, avatar_url: null },
    size: 1,
    max_size: 3,
    ...overrides,
  };
}

export function myTeams(overrides: Partial<MyTeams> = {}): MyTeams {
  return { team: null, invited_to: [], requested: [], max_size: 3, ...overrides };
}
