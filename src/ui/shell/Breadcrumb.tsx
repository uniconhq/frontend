import { Link, useLocation, useParams } from 'react-router';
import { $api } from '@/api/query';
import { useSession } from '@/session';
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
import { PlaceMenu, type Place } from './PlaceMenu';
import classes from './Breadcrumb.module.css';

/** A part of the trail; one with no `to` is a page that is no place, such as "Page not found". */
type Segment = { label: string; to?: string; menu?: Place };

type Params = Partial<
  Record<'org' | 'contest' | 'task' | 'owner' | 'name' | '*', string>
>;

type Names = { org: string; contest: string; task: string };

const HELD = { enabled: false } as const;

/**
 * The org's, contest's and task's names from what the pages have already
 * read: the trail never asks the server itself. Until a name is in, a part
 * is called by its address.
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

/** The section this page is, or is below (a file open in Settings is Settings'). */
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
  if (pathname === ORGS_PATH) return [{ label: 'Orgs', to: ORGS_PATH }];
  if (pathname === NEW_ORG_PATH) return [{ label: 'New org', to: pathname }];
  if (org === undefined) return [];
  const segments: Segment[] = [
    { label: names.org, to: orgPath(org), menu: { kind: 'org', org } },
  ];
  if (contest === undefined) {
    return [
      ...segments,
      ...sectionCrumb(pathname, ORG_SECTIONS, (key) => orgSectionPath(org, key)),
    ];
  }
  segments.push({
    label: names.contest,
    to: contestPath(org, contest),
    menu: { kind: 'contest', org, contest },
  });
  if (task === undefined) {
    return [
      ...segments,
      ...sectionCrumb(pathname, CONTEST_SECTIONS, (key) =>
        contestSectionPath(org, contest, key),
      ),
    ];
  }
  segments.push({
    label: names.task,
    to: taskPath(org, contest, task),
    menu: { kind: 'task', org, contest, task },
  });
  return [
    ...segments,
    ...sectionCrumb(pathname, TASK_SECTIONS, (key) =>
      taskSectionPath(org, contest, task, key),
    ),
  ];
}

function contestantTrail(
  pathname: string,
  { org, contest, task }: Params,
  names: Names,
): Segment[] {
  if (org === undefined || contest === undefined) return [];
  const segments: Segment[] = [
    {
      label: names.contest,
      to: contestHomePath(org, contest),
      menu: { kind: 'entered', org, contest },
    },
  ];
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

const PLACES: Record<string, string> = {
  '/account': 'Account',
  '/invites': 'Invites',
  '/login': 'Sign in',
  [WORKFLOWS_PATH]: 'Workflows',
};

function belowHome(pathname: string, params: Params, names: Names): Segment[] {
  if (pathname === '/') return [];
  // Only the not-found route matches `*`.
  if (params['*'] !== undefined) return [{ label: 'Page not found' }];
  if (isOrganiserPath(pathname)) return organiserTrail(pathname, params, names);
  if (isContestantPath(pathname)) return contestantTrail(pathname, params, names);
  const { owner, name } = params;
  if (
    pathname.startsWith(`${WORKFLOWS_PATH}/`) &&
    owner !== undefined &&
    name !== undefined
  ) {
    return [{ label: `${owner}/${name}`, to: workflowPath(owner, name) }];
  }
  const place = PLACES[pathname];
  return [
    place === undefined ? { label: 'Page not found' } : { label: place, to: pathname },
  ];
}

/**
 * Where you are, from Home down, every part a link. A part's arrow lists
 * what sits under it, so any place along the path is one click away. The
 * header sits above the page's route, and React Router still hands it the
 * params the page matched.
 */
export function Breadcrumb() {
  const { pathname } = useLocation();
  const params = useParams();
  const signedIn = useSession().status === 'signed-in';
  const segments: Segment[] = [
    { label: 'Home', to: '/', menu: signedIn ? { kind: 'home' } : undefined },
    ...belowHome(pathname, params, useNames(params)),
  ];

  return (
    <nav className={classes.trail} aria-label="Breadcrumb">
      {segments.map((segment, index) => (
        <span key={segment.to ?? segment.label} className={classes.step}>
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
          {segment.menu !== undefined && (
            <PlaceMenu label={segment.label} place={segment.menu} />
          )}
        </span>
      ))}
    </nav>
  );
}
