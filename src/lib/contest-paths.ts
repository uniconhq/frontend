/** Contestant pages live under `/contests`, which the proxy in `deploy` sends here. */
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
