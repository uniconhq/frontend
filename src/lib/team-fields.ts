import { t } from './t';

/**
 * The limits of the fields the team forms share. A team's name is checked
 * once trimmed, as the forge checks it, so spaces around it do not count
 * against its length. A Forgejo username is at most 40 characters.
 */
const TEAM_NAME_MAX = 60;
export const USERNAME_MAX = 40;

/** What is wrong with a team's name as typed, or null when it will do. */
export function teamNameProblem(typed: string): string | null {
  const trimmed = typed.trim();
  if (trimmed === '') return t('A team needs a name.');
  if (trimmed.length > TEAM_NAME_MAX) {
    return `${t('A team’s name is at most')} ${TEAM_NAME_MAX} ${t('characters.')}`;
  }
  return null;
}
