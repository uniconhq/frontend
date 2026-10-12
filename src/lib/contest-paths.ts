/**
 * Where each contestant page lives. They are under `/contests`, which the
 * proxy in `deploy` sends to this app the way it sends `/orgs`, and the same
 * address serves a visitor and a signed-in person, so a link to a contest can
 * be passed around before anyone has an account.
 */
const part = encodeURIComponent;

const CONTESTS_PATH = '/contests';

export function isContestantPath(pathname: string): boolean {
  return pathname.startsWith(`${CONTESTS_PATH}/`);
}

export function contestHomePath(org: string, contest: string): string {
  return `${CONTESTS_PATH}/${part(org)}/${part(contest)}`;
}

export function taskPagePath(org: string, contest: string, task: string): string {
  return `${contestHomePath(org, contest)}/tasks/${part(task)}`;
}
