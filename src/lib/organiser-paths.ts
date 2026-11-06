/**
 * Organiser pages must live under `/orgs`: the proxy in `deploy` sends only
 * that here, so a page elsewhere works in dev and 404s behind the proxy.
 */
const part = encodeURIComponent;

export const ORGS_PATH = '/orgs';
export const NEW_ORG_PATH = `${ORGS_PATH}/new`;

export function isOrganiserPath(pathname: string): boolean {
  return pathname === ORGS_PATH || pathname.startsWith(`${ORGS_PATH}/`);
}

export function orgPath(org: string): string {
  return `${ORGS_PATH}/${part(org)}`;
}

export function contestPath(org: string, contest: string): string {
  return `${orgPath(org)}/contests/${part(contest)}`;
}

export function taskPath(org: string, contest: string, task: string): string {
  return `${contestPath(org, contest)}/tasks/${part(task)}`;
}

/** A workflow belongs to a person or an org, so it lives outside `/orgs`. */
export const WORKFLOWS_PATH = '/workflows';

export function workflowPath(owner: string, name: string, version?: string): string {
  const base = `${WORKFLOWS_PATH}/${part(owner)}/${part(name)}`;
  return version === undefined ? base : `${base}?version=${part(version)}`;
}
