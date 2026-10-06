import { $api, queryView, type QueryView } from '@/api/query';
import type { ContestSummary } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { PageLink } from '@/ui/PageLink';
import { SectionTitle } from '@/ui/SectionTitle';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { contestHomePath } from '@/lib/contest-paths';
import { formatDateTime } from '@/lib/time';
import classes from './HomePage.module.css';

type Status = NonNullable<ContestSummary['status']>;

type Listed = {
  where: { org: string; contest: string };
  name: string;
  start: string;
  end: string;
  status?: Status | null;
};

/** What a person's own registration says, beside the contest in the list. */
const STATUS: Record<Status, string> = {
  pending: 'Registration waiting',
  approved: 'Registered',
  rejected: 'Not accepted',
  withdrawn: 'Withdrawn',
  removed: 'Removed',
};

function Contests({ label, contests }: { label: string; contests: Listed[] }) {
  if (contests.length === 0) {
    return <BodyText tone="secondary">No contest to show yet.</BodyText>;
  }
  return (
    <ul className={classes.contests} aria-label={label}>
      {contests.map((contest) => (
        <li
          key={`${contest.where.org}/${contest.where.contest}`}
          className={classes.contest}
        >
          <PageLink to={contestHomePath(contest.where.org, contest.where.contest)}>
            {contest.name}
          </PageLink>
          <BodyText tone="secondary">
            {formatDateTime(new Date(contest.start))} –{' '}
            {formatDateTime(new Date(contest.end))}
            {contest.status != null && ` · ${STATUS[contest.status]}`}
          </BodyText>
        </li>
      ))}
    </ul>
  );
}

/** One titled list of contests, as its read stands. */
function ContestSection({ title, view }: { title: string; view: QueryView<Listed[]> }) {
  return (
    <section className={classes.section}>
      <SectionTitle>{title}</SectionTitle>
      {view.state === 'loading' && <PageSkeleton rows={2} />}
      {view.state === 'error' && <ErrorBlock error={view.error} onRetry={view.retry} />}
      {view.state === 'ready' && <Contests label={title} contests={view.data} />}
    </section>
  );
}

/** The contests whose visibility is everyone, read with no session. */
export function PublicContests() {
  const view = queryView($api.useQuery('get', '/api/v1/public/contests'));
  return <ContestSection title="Public contests" view={view} />;
}

/** Every contest the signed-in person may enter or has, with their own registration. */
export function MyContests() {
  const view = queryView($api.useQuery('get', '/api/v1/contests'));
  return <ContestSection title="Contests" view={view} />;
}
