/**
 * Where each organiser page lives. Every one is under `/orgs`: the proxy in
 * `deploy` sends exactly `/orgs` and `/orgs/...` to this app and answers a
 * path it does not list with its own 404, so a page anywhere else loads in the
 * dev server and breaks behind the proxy. The organiser pages and the shell's
 * breadcrumb both build their links here.
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

export function clarificationsPath(org: string): string {
  return `${orgPath(org)}/clarifications`;
}

export function contestantsPath(org: string, contest: string): string {
  return `${contestPath(org, contest)}/contestants`;
}

export function teamsPath(org: string, contest: string): string {
  return `${contestPath(org, contest)}/teams`;
}

export function gradingsPath(org: string, contest: string): string {
  return `${contestPath(org, contest)}/gradings`;
}

export function boardsPath(org: string, contest: string): string {
  return `${contestPath(org, contest)}/boards`;
}

/**
 * The workflow pages, at `/workflows` and `/workflows/<owner>/<name>`, which
 * the proxy sends here as well: a workflow is a person's or an org's, so it
 * has an address of its own rather than one under an org.
 */
export const WORKFLOWS_PATH = '/workflows';

export function workflowPath(owner: string, name: string, version?: string): string {
  const base = `${WORKFLOWS_PATH}/${part(owner)}/${part(name)}`;
  return version === undefined ? base : `${base}?version=${part(version)}`;
}
