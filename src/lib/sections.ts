import { contestHomePath } from './contest-paths';
import { contestPath, orgPath, taskPath } from './organiser-paths';

/**
 * The sections of an org, a contest and a task, in the order its page shows
 * them. One list drives the cards, the breadcrumb, each section's title and
 * the routes, so they cannot drift apart.
 *
 * `segment` is the section's part of the address. `card` says where its page
 * shows it: in the grid, or as the summary at the top (a contest's settings).
 */
export type Section<Key extends string = string> = {
  key: Key;
  label: string;
  segment: string;
  card: 'grid' | 'summary';
  line?: string;
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
  { key: 'entry', label: 'How people enter', segment: 'entry', card: 'grid' },
  { key: 'entrants', label: 'Entrants', segment: 'entrants', card: 'grid' },
  { key: 'gradings', label: 'Gradings', segment: 'gradings', card: 'grid' },
  { key: 'boards', label: 'Leaderboards', segment: 'leaderboards', card: 'grid' },
  {
    key: 'announcements',
    label: 'Announcements',
    segment: 'announcements',
    card: 'grid',
  },
  { key: 'questions', label: 'Questions', segment: 'questions', card: 'grid' },
  {
    key: 'organisers',
    label: 'Contest organisers',
    segment: 'organisers',
    card: 'grid',
  },
] as const satisfies readonly Section[];

/**
 * A task's sections for running it, each a page of its own. What builds the
 * task (its workflow, inputs, runs, scoring and checks, and statement) is on the
 * task's own page, as the cards `TASK_BUILD_CARDS` lists, each file it holds
 * changed on the card it belongs to; its Settings page holds its title, its
 * settings as they are stored and, for its admins, every file to read (M51).
 */
export const TASK_SECTIONS = [
  {
    key: 'gradings',
    label: 'Gradings',
    segment: 'gradings',
    card: 'grid',
    line: "Every submission's grading: waiting, running, done or failed. Grade one again from here.",
  },
  {
    key: 'marking',
    label: 'Marking',
    segment: 'marking',
    card: 'grid',
    line: 'Submissions waiting for a mark you give by hand. A task can leave a value to organisers; each counted submission waits here until it has its marks.',
  },
  {
    key: 'publications',
    label: 'Publications',
    segment: 'publications',
    card: 'grid',
    line: "A publication is the task as entrants are graded on it. Every save without problems makes a new one, numbered from 1, and entrants are graded on the newest. While the contest is running, a save asks before publishing, since it may grade earlier submissions again. If a publication's checks fail, entrants stay on the last one that passed.",
  },
  {
    key: 'announcements',
    label: 'Announcements',
    segment: 'announcements',
    card: 'grid',
    line: 'Messages from the organisers to everyone taking the task.',
  },
  {
    key: 'organisers',
    label: 'Task organisers',
    segment: 'organisers',
    card: 'grid',
    line: 'Who can change or read this task, and what each role may do.',
  },
  {
    key: 'settings',
    label: 'Settings',
    segment: 'settings',
    card: 'grid',
    line: "The task's title, and the files it is saved as.",
  },
] as const satisfies readonly Section[];

/** The cards that build a task, on its page. Each key is the card's anchor (`?card=`). */
export const TASK_BUILD_CARDS = [
  { key: 'workflow', label: 'Workflow' },
  { key: 'inputs', label: 'Inputs' },
  { key: 'runs', label: 'Runs' },
  { key: 'scoring', label: 'Scoring' },
  { key: 'checks', label: 'Checks' },
  { key: 'tests', label: 'Submissions' },
  { key: 'statement', label: 'Statement' },
] as const;

/** A card on the task's page, opened by its address: `?card=tests`. */
export function taskCardPath(
  org: string,
  contest: string,
  task: string,
  card: (typeof TASK_BUILD_CARDS)[number]['key'],
): string {
  return `${taskPath(org, contest, task)}?card=${card}`;
}

/**
 * The contest as its entrants see it: its tasks, on its own page, its
 * leaderboards, and their questions to the organisers, which every task's
 * page also links to.
 */
export const CONTEST_VIEW_SECTIONS = [
  { key: 'tasks', label: 'Tasks', segment: '', card: 'grid' },
  { key: 'boards', label: 'Leaderboards', segment: 'leaderboards', card: 'grid' },
  { key: 'questions', label: 'Questions', segment: 'questions', card: 'grid' },
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

/**
 * Where staff read one entrant's submissions to a task: the contest's
 * gradings, kept to that task and entrant.
 */
export function entrantGradingsPath(
  org: string,
  contest: string,
  task: string,
  entrant: string,
): string {
  const search = new URLSearchParams({ task, entrant });
  return `${contestSectionPath(org, contest, 'gradings')}?${search.toString()}`;
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
