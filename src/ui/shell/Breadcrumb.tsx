import { Link, useLocation, useParams } from 'react-router';
import { $api } from '@/api/query';
import { contestHomePath, isContestantPath, taskPagePath } from '@/lib/contest-paths';
import {
  NEW_ORG_PATH,
  ORGS_PATH,
  WORKFLOWS_PATH,
  contestPath,
  isOrganiserPath,
  orgPath,
  taskPath,
  workflowPath,
} from '@/lib/organiser-paths';
import {
  CONTEST_SECTIONS,
  CONTEST_VIEW_SECTIONS,
  ORG_SECTIONS,
  TASK_SECTIONS,
  contestSectionPath,
  contestViewSectionPath,
  orgSectionPath,
  taskSectionPath,
  type Section,
} from '@/lib/sections';
import { headingOf } from '@/lib/task-names';
import classes from './Breadcrumb.module.css';

/** A step of the trail; one with no `to` names a level that has no page of its own. */
type Segment = { label: string; to?: string };

type Params = Partial<Record<'org' | 'contest' | 'task' | 'owner' | 'name', string>>;

/** What the trail calls the org, the contest and the task. */
type Names = { org: string; contest: string; task: string };

/** A read the trail never makes: it takes what a page has already read. */
const HELD = { enabled: false } as const;

/**
 * What the trail calls the org, the contest and the task, from what the pages
 * have already read, by the same reads: the org's display name from the org's
 * own page, the contest's name from its home, and a task by its label and
 * title, as its page heads it, from its page or its contest's list of tasks.
 * Nothing is asked of the server for the trail. Until a name is in, or on a
 * page that never reads it, the step is called by its address.
 */
function useNames({ org = '', contest = '', task = '' }: Params): Names {
  const inOrg = { params: { path: { org } } };
  const inContest = { params: { path: { org, contest } } };
  const inTask = { params: { path: { org, contest, task } } };
  const profile = $api.useQuery('get', '/api/v1/orgs/{org}', inOrg, HELD).data;
  const home = $api.useQuery(
    'get',
    '/api/v1/orgs/{org}/contests/{contest}/home',
    inContest,
    HELD,
  ).data;
  const shown = $api.useQuery(
    'get',
    '/api/v1/public/contests/{org}/{contest}',
    inContest,
    HELD,
  ).data;
  const page = $api.useQuery(
    'get',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/page',
    inTask,
    HELD,
  ).data;
  const statement = $api.useQuery(
    'get',
    '/api/v1/public/contests/{org}/{contest}/tasks/{task}',
    inTask,
    HELD,
  ).data;

  const named =
    page ??
    statement?.task ??
    home?.tasks.find((found) => found.name === task) ??
    shown?.tasks.find((found) => found.name === task);
  const displayName = profile?.display_name;
  return {
    org:
      displayName === null || displayName === undefined || displayName === ''
        ? org
        : displayName,
    contest: home?.name ?? shown?.name ?? contest,
    task: named === undefined ? task : headingOf(named),
  };
}

/**
 * The section of a level whose page this is, from the level's own list of
 * sections, so a section's crumb is its card's and its sidebar entry's
 * label. A page below a section, such as a file open in Files, is that
 * section's.
 */
function sectionCrumb<S extends Section>(
  pathname: string,
  sections: readonly S[],
  pathOf: (key: S['key']) => string,
): Segment[] {
  const found = sections.find((section) => {
    if (section.segment === '') return false;
    const path = pathOf(section.key);
    return pathname === path || pathname.startsWith(`${path}/`);
  });
  return found === undefined ? [] : [{ label: found.label, to: pathOf(found.key) }];
}

function organiserTrail(
  pathname: string,
  { org, contest, task }: Params,
  names: Names,
): Segment[] {
  const segments: Segment[] = [{ label: 'Orgs', to: ORGS_PATH }];
  if (pathname === NEW_ORG_PATH)
    return [...segments, { label: 'New org', to: pathname }];
  if (org === undefined) return segments;
  segments.push({ label: names.org, to: orgPath(org) });
  if (contest === undefined) {
    return [
      ...segments,
      ...sectionCrumb(pathname, ORG_SECTIONS, (key) => orgSectionPath(org, key)),
    ];
  }
  segments.push({ label: names.contest, to: contestPath(org, contest) });
  if (task === undefined) {
    return [
      ...segments,
      ...sectionCrumb(pathname, CONTEST_SECTIONS, (key) =>
        contestSectionPath(org, contest, key),
      ),
    ];
  }
  segments.push({ label: names.task, to: taskPath(org, contest, task) });
  return [
    ...segments,
    ...sectionCrumb(pathname, TASK_SECTIONS, (key) =>
      taskSectionPath(org, contest, task, key),
    ),
  ];
}

/**
 * A contest as its contestants see it, under the page that lists the
 * contests; its org is named, and has no page for a contestant to go to.
 */
function contestantTrail(
  pathname: string,
  { org, contest, task }: Params,
  names: Names,
): Segment[] {
  const segments: Segment[] = [{ label: 'Browse contests', to: '/' }];
  if (org === undefined || contest === undefined) return segments;
  segments.push(
    { label: names.org },
    { label: names.contest, to: contestHomePath(org, contest) },
  );
  if (task !== undefined) {
    return [...segments, { label: names.task, to: taskPagePath(org, contest, task) }];
  }
  return [
    ...segments,
    ...sectionCrumb(pathname, CONTEST_VIEW_SECTIONS, (key) =>
      contestViewSectionPath(org, contest, key),
    ),
  ];
}

/** Every page that is no org's or contest's, by its own name. */
const PLACES: Record<string, string> = {
  '/': 'Browse contests',
  '/account': 'Account',
  '/invites': 'Invites',
  '/login': 'Sign in',
};

function trailOf(pathname: string, params: Params, names: Names): Segment[] {
  if (isOrganiserPath(pathname)) return organiserTrail(pathname, params, names);
  if (isContestantPath(pathname)) return contestantTrail(pathname, params, names);
  if (pathname === WORKFLOWS_PATH || pathname.startsWith(`${WORKFLOWS_PATH}/`)) {
    const segments: Segment[] = [{ label: 'Workflows', to: WORKFLOWS_PATH }];
    const { owner, name } = params;
    if (owner !== undefined && name !== undefined) {
      segments.push({ label: `${owner}/${name}`, to: workflowPath(owner, name) });
    }
    return segments;
  }
  const place = PLACES[pathname];
  // An address that is no page's is said as such, not as some other page.
  return [
    place === undefined ? { label: 'Page not found' } : { label: place, to: pathname },
  ];
}

/**
 * Where you are, every step back up one click away: under `/orgs` the org,
 * the contest, the task and the section, each segment its page; under
 * `/contests` the contests, the contest's org, the contest and the task or
 * the leaderboards; the workflows and a workflow; and every other page by
 * its own name. The last segment is the page being shown. The header sits
 * above the page's route, and React Router hands a parent route the params
 * its children matched, so this reads them without the page saying anything.
 * The org, the contest and the task are called by their names once a page
 * has read them (`useNames`). A step with no page of its own is plain words,
 * not a chip, so it is not taken for a link; a name cut short says itself
 * in full on hover.
 */
export function Breadcrumb() {
  const { pathname } = useLocation();
  const params = useParams();
  const segments = trailOf(pathname, params, useNames(params));

  return (
    <nav className={classes.trail} aria-label="Breadcrumb">
      {segments.map((segment, index) => (
        <span key={`${segment.label}:${String(index)}`} className={classes.step}>
          {index > 0 && (
            <span className={classes.caret} aria-hidden="true">
              /
            </span>
          )}
          {segment.to === undefined ? (
            <span
              className={`${classes.segment} ${classes.plain}`}
              title={segment.label}
            >
              {segment.label}
            </span>
          ) : (
            <Link
              to={segment.to}
              className={`${classes.segment} ${classes.link}`}
              title={segment.label}
              aria-current={index === segments.length - 1 ? 'page' : undefined}
            >
              {segment.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
