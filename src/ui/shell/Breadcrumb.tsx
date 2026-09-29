import { Link, useLocation, useParams } from 'react-router';
import {
  ORGS_PATH,
  contestPath,
  isOrganiserPath,
  orgPath,
  taskPath,
} from '@/lib/organiser-paths';
import { t } from '@/lib/t';
import classes from './Breadcrumb.module.css';

type Segment = { label: string; to: string };

/**
 * Filesystem-style trail. Under `/orgs` it walks the route's own params, org,
 * contest and task, each segment a link to that level, and the one for the
 * page being shown is marked as it. Everywhere else it is the one static
 * `browse` segment until contestant routes name a contest. The header sits
 * above the page's route, and React Router hands a parent route the params
 * its children matched, so this reads them without the page having to say
 * anything.
 */
export function Breadcrumb() {
  const { pathname } = useLocation();
  const { org, contest, task } = useParams();

  if (!isOrganiserPath(pathname)) {
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

  const segments: Segment[] = [{ label: t('orgs'), to: ORGS_PATH }];
  if (org !== undefined) {
    segments.push({ label: org, to: orgPath(org) });
    if (contest !== undefined) {
      segments.push({ label: contest, to: contestPath(org, contest) });
      if (task !== undefined) {
        segments.push({ label: task, to: taskPath(org, contest, task) });
      }
    }
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
