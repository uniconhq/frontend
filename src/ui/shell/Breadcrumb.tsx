import { Link, useLocation, useParams } from 'react-router';
import { contestHomePath, isContestantPath, taskPagePath } from '@/lib/contest-paths';
import {
  ORGS_PATH,
  contestPath,
  contestantsPath,
  isOrganiserPath,
  orgPath,
  taskPath,
  teamsPath,
} from '@/lib/organiser-paths';
import { t } from '@/lib/t';
import classes from './Breadcrumb.module.css';

type Segment = { label: string; to: string };

/**
 * Filesystem-style trail. Under `/orgs` it walks the route's own params, org,
 * contest and task, each segment a link to that level, and the one for the
 * page being shown is marked as it. Under `/contests` it is the contests on
 * the home page, then the contest and the task. Everywhere else it is the
 * one static `browse` segment. The header sits above the page's route, and
 * React Router hands a parent route the params its children matched, so this
 * reads them without the page having to say anything.
 */
export function Breadcrumb() {
  const { pathname } = useLocation();
  const { org, contest, task } = useParams();

  const segments = isOrganiserPath(pathname)
    ? organiserTrail(pathname, org, contest, task)
    : isContestantPath(pathname)
      ? contestantTrail(org, contest, task)
      : null;

  if (segments === null) {
    return (
      <nav className={classes.trail} aria-label={t('Breadcrumb')}>
        <span className={classes.segment}>
          {t('browse')}
          <span className={classes.caret} aria-hidden="true">
            ▾
          </span>
        </span>
      </nav>
    );
  }

  return (
    <nav className={classes.trail} aria-label={t('Breadcrumb')}>
      {segments.map((segment, index) => (
        <span key={segment.to} className={classes.step}>
          {index > 0 && (
            <span className={classes.caret} aria-hidden="true">
              /
            </span>
          )}
          <Link
            to={segment.to}
            className={`${classes.segment} ${classes.link}`}
            aria-current={segment.to === pathname ? 'page' : undefined}
          >
            {segment.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}

function organiserTrail(
  pathname: string,
  org?: string,
  contest?: string,
  task?: string,
): Segment[] {
  const segments: Segment[] = [{ label: t('orgs'), to: ORGS_PATH }];
  if (org !== undefined) {
    segments.push({ label: org, to: orgPath(org) });
    if (contest !== undefined) {
      segments.push({ label: contest, to: contestPath(org, contest) });
      if (task !== undefined) {
        segments.push({ label: task, to: taskPath(org, contest, task) });
      } else if (pathname === contestantsPath(org, contest)) {
        segments.push({ label: t('contestants'), to: pathname });
      } else if (pathname === teamsPath(org, contest)) {
        segments.push({ label: t('teams'), to: pathname });
      }
    }
  }
  return segments;
}

function contestantTrail(org?: string, contest?: string, task?: string): Segment[] {
  const segments: Segment[] = [{ label: t('contests'), to: '/' }];
  if (org !== undefined && contest !== undefined) {
    segments.push({ label: contest, to: contestHomePath(org, contest) });
    if (task !== undefined) {
      segments.push({ label: task, to: taskPagePath(org, contest, task) });
    }
  }
  return segments;
}
