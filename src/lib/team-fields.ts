/**
 * The limit of a team's name. It is checked once trimmed, as the forge
 * checks it, so spaces around it do not count against its length, and its
 * characters are counted as the forge counts them, a character outside the
 * BMP as one.
 */
const TEAM_NAME_MAX = 60;

/** What is wrong with a team's name as typed, or null when it will do. */
export function teamNameProblem(typed: string): string | null {
  const trimmed = typed.trim();
  if (trimmed === '') return 'A team needs a name.';
  if ([...trimmed].length > TEAM_NAME_MAX) {
    return `A team’s name is at most ${TEAM_NAME_MAX} characters.`;
  }
  return null;
}
