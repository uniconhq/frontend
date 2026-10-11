import { contestHomePath } from './contest-paths';
import { contestPath, orgPath, taskPath } from './organiser-paths';

/**
 * The sections of an org, a contest and a task, each list in the order its
 * hub shows them. One list drives the hub's cards, the sidebar while you are
 * inside that org, contest or task, the breadcrumb's last segment, each
 * section page's title and the route table, so a card, its sidebar entry,
 * its crumb and its page cannot drift apart: a section added here has all
 * four, and one taken out loses all four.
 *
 * `segment` is the section's part of the address under its level. `card`
 * says where its hub shows it: in the grid of cards, as the summary at the
 * top (a contest's settings), or among the cards that build a task.
 */
export type Section<Key extends string = string> = {
  key: Key;
  label: string;
  segment: string;
  card: 'grid' | 'summary' | 'build';
};

export const ORG_SECTIONS = [
  { key: 'organisers', label: 'Org organisers', segment: 'organisers', card: 'grid' },
  {
    key: 'questions',
    label: 'Open questions',
    segment: 'clarifications',
    card: 'grid',
  },
  { key: 'settings', label: 'Settings', segment: 'settings', card: 'grid' },
] as const satisfies readonly Section[];

export const CONTEST_SECTIONS = [
  { key: 'settings', label: 'Settings', segment: 'settings', card: 'summary' },
  { key: 'contestants', label: 'Contestants', segment: 'contestants', card: 'grid' },
  { key: 'teams', label: 'Teams', segment: 'teams', card: 'grid' },
  { key: 'gradings', label: 'Gradings', segment: 'gradings', card: 'grid' },
  { key: 'boards', label: 'Boards', segment: 'boards', card: 'grid' },
  {
    key: 'announcements',
    label: 'Announcements',
    segment: 'announcements',
    card: 'grid',
  },
  { key: 'questions', label: 'Questions', segment: 'questions', card: 'grid' },
  { key: 'files', label: 'Files', segment: 'files', card: 'grid' },
  {
    key: 'organisers',
    label: 'Contest organisers',
    segment: 'organisers',
    card: 'grid',
  },
] as const satisfies readonly Section[];

/**
 * A task's statement is built on its own page; its workflow, inputs and
 * scoring are one form today, its settings, which is last in the grid for
 * running the task, as the rest of the grid is.
 */
export const TASK_SECTIONS = [
  { key: 'statement', label: 'Statement', segment: 'statement', card: 'build' },
  { key: 'gradings', label: 'Gradings', segment: 'gradings', card: 'grid' },
  {
    key: 'publications',
    label: 'Publications',
    segment: 'publications',
    card: 'grid',
  },
  {
    key: 'announcements',
    label: 'Announcements',
    segment: 'announcements',
    card: 'grid',
  },
  { key: 'files', label: 'Files', segment: 'files', card: 'grid' },
  { key: 'organisers', label: 'Task organisers', segment: 'organisers', card: 'grid' },
  { key: 'settings', label: 'Settings', segment: 'settings', card: 'grid' },
] as const satisfies readonly Section[];

/**
 * The cards that build a task, in the order one decides the next, each with
 * the section it opens: the workflow, its inputs, and the tests and their
 * scoring are each a part of the task's settings, the statement a section
 * of its own.
 */
export const TASK_BUILD_CARDS = [
  { key: 'workflow', label: 'Workflow', section: 'settings' },
  { key: 'inputs', label: 'Inputs', section: 'settings' },
  { key: 'tests', label: 'Tests and scoring', section: 'settings' },
  { key: 'statement', label: 'Statement', section: 'statement' },
] as const satisfies readonly { key: string; label: string; section: TaskSectionKey }[];

/** The contest as its contestants see it: its tasks, on its own page, and its boards. */
export const CONTEST_VIEW_SECTIONS = [
  { key: 'tasks', label: 'Tasks', segment: '', card: 'grid' },
  { key: 'boards', label: 'Leaderboards', segment: 'boards', card: 'grid' },
] as const satisfies readonly Section[];

export type OrgSectionKey = (typeof ORG_SECTIONS)[number]['key'];
export type ContestSectionKey = (typeof CONTEST_SECTIONS)[number]['key'];
export type TaskSectionKey = (typeof TASK_SECTIONS)[number]['key'];

/** A section's own address, under the address of its level. */
function under(base: string, segment: string): string {
  return segment === '' ? base : `${base}/${segment}`;
}

export function orgSectionPath(org: string, key: OrgSectionKey): string {
  return under(orgPath(org), sectionOf(ORG_SECTIONS, key).segment);
}

export function contestSectionPath(
  org: string,
  contest: string,
  key: ContestSectionKey,
): string {
  return under(contestPath(org, contest), sectionOf(CONTEST_SECTIONS, key).segment);
}

export function taskSectionPath(
  org: string,
  contest: string,
  task: string,
  key: TaskSectionKey,
): string {
  return under(taskPath(org, contest, task), sectionOf(TASK_SECTIONS, key).segment);
}

export function contestViewSectionPath(
  org: string,
  contest: string,
  key: (typeof CONTEST_VIEW_SECTIONS)[number]['key'],
): string {
  return under(
    contestHomePath(org, contest),
    sectionOf(CONTEST_VIEW_SECTIONS, key).segment,
  );
}

export function sectionOf<S extends Section>(sections: readonly S[], key: S['key']): S {
  const found = sections.find((section) => section.key === key);
  if (found === undefined) throw new Error(`no section ${key}`);
  return found;
}

/**
 * The places that are no org's, contest's or task's, which the sidebar lists
 * everywhere and alone outside any of them. `signedIn` ones are for someone
 * with an account.
 */
export const TOP_PLACES = [
  { label: 'Browse contests', to: '/', signedIn: false },
  { label: 'Orgs', to: '/orgs', signedIn: true },
  { label: 'Workflows', to: '/workflows', signedIn: true },
  { label: 'Account', to: '/account', signedIn: true },
] as const;
