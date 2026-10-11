import { Link, useLocation, useParams } from 'react-router';
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
import classes from './Breadcrumb.module.css';

/** A step of the trail; one with no `to` names a level that has no page of its own. */
type Segment = { label: string; to?: string };

type Params = Partial<Record<'org' | 'contest' | 'task' | 'owner' | 'name', string>>;

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

function organiserTrail(pathname: string, { org, contest, task }: Params): Segment[] {
  const segments: Segment[] = [{ label: 'Orgs', to: ORGS_PATH }];
  if (pathname === NEW_ORG_PATH)
    return [...segments, { label: 'New org', to: pathname }];
  if (org === undefined) return segments;
  segments.push({ label: org, to: orgPath(org) });
  if (contest === undefined) {
    return [
      ...segments,
      ...sectionCrumb(pathname, ORG_SECTIONS, (key) => orgSectionPath(org, key)),
    ];
  }
  segments.push({ label: contest, to: contestPath(org, contest) });
  if (task === undefined) {
    return [
      ...segments,
      ...sectionCrumb(pathname, CONTEST_SECTIONS, (key) =>
        contestSectionPath(org, contest, key),
      ),
    ];
  }
  segments.push({ label: task, to: taskPath(org, contest, task) });
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
function contestantTrail(pathname: string, { org, contest, task }: Params): Segment[] {
  const segments: Segment[] = [{ label: 'Browse contests', to: '/' }];
  if (org === undefined || contest === undefined) return segments;
  segments.push({ label: org }, { label: contest, to: contestHomePath(org, contest) });
  if (task !== undefined) {
    return [...segments, { label: task, to: taskPagePath(org, contest, task) }];
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

function trailOf(pathname: string, params: Params): Segment[] {
  if (isOrganiserPath(pathname)) return organiserTrail(pathname, params);
  if (isContestantPath(pathname)) return contestantTrail(pathname, params);
  if (pathname === WORKFLOWS_PATH || pathname.startsWith(`${WORKFLOWS_PATH}/`)) {
    const segments: Segment[] = [{ label: 'Workflows', to: WORKFLOWS_PATH }];
    const { owner, name } = params;
    if (owner !== undefined && name !== undefined) {
      segments.push({ label: `${owner}/${name}`, to: workflowPath(owner, name) });
    }
    return segments;
  }
  const place = PLACES[pathname];
  return [
    { label: place ?? 'Browse contests', to: place === undefined ? '/' : pathname },
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
 */
export function Breadcrumb() {
  const { pathname } = useLocation();
  const segments = trailOf(pathname, useParams());

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
            <span className={classes.segment}>{segment.label}</span>
          ) : (
            <Link
              to={segment.to}
              className={`${classes.segment} ${classes.link}`}
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
