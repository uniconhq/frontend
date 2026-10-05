import type { Clarification } from '@/api/types';

/**
 * Whether a question is a team's, asked from its shared desk, which every
 * member reads, rather than one person's. `asker` is `team.<id>` for a team.
 */
export function isTeams(clarification: Clarification): boolean {
  return clarification.asker.startsWith('team.');
}
