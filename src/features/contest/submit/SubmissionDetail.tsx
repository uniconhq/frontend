import { useQuery } from '@tanstack/react-query';
import { $api, queryView, widenQuery } from '@/api/query';
import type { GradingResult } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { PageLink } from '@/ui/PageLink';
import { SectionTitle } from '@/ui/SectionTitle';
import { VerdictBadge } from '@/ui/VerdictBadge';
import { ErrorBlock } from '@/ui/feedback/ErrorBlock';
import { PageSkeleton } from '@/ui/feedback/PageSkeleton';
import { formatSize } from '@/lib/size';
import { formatDateTime } from '@/lib/time';
import { t } from '@/lib/t';
import { metricValue, pollEvery, verdictOf } from './grading';
import { Metrics } from './Results';
import shared from '../contest.module.css';
import classes from './submit.module.css';

type Where = { org: string; contest: string; task: string; number: number };

/**
 * One row per test, with its own outcome, time, memory and metrics, and the
 * checker's note on it where any row has one.
 */
function Tests({ grading }: { grading: GradingResult }) {
  const rows = grading.tests ?? [];
  if (rows.length === 0) return null;
  const names = [...new Set(rows.flatMap((row) => Object.keys(row.metrics)))];
  const notes = rows.some((row) => row.message !== null && row.message !== '');
  return (
    <table className={classes.table} aria-label={`${t('Tests')} ${grading.stage}`}>
      <thead>
        <tr>
          <th scope="col">{t('Test')}</th>
          <th scope="col">{t('Outcome')}</th>
          <th scope="col">{t('Time')}</th>
          <th scope="col">{t('Memory')}</th>
          {names.map((name) => (
            <th key={name} scope="col">
              {name}
            </th>
          ))}
          {notes && <th scope="col">{t('Note')}</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <th scope="row" className={classes.mono}>
              {row.id}
            </th>
            <td>
              <VerdictBadge verdict={row.outcome} />
            </td>
            <td>{row.time_ms === null ? '—' : `${row.time_ms} ${t('ms')}`}</td>
            <td>{row.memory_kb === null ? '—' : formatSize(row.memory_kb * 1024)}</td>
            {names.map((name) => {
              const value = row.metrics[name];
              return (
                <td key={name}>{value === undefined ? '—' : metricValue(value)}</td>
              );
            })}
            {notes && <td>{row.message ?? ''}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The run log of one stage, read only once the grading says there is one.
 * It is kept by the grading it is of, so a rejudge's new attempt reads its
 * own log rather than showing the last one's.
 */
function Log({ where, grading }: { where: Where; grading: GradingResult }) {
  const options = widenQuery(
    $api.queryOptions(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/submissions/{number}/log',
      { params: { path: where, query: { stage: grading.stage } }, parseAs: 'text' },
    ),
  );
  const view = queryView(
    useQuery({ ...options, queryKey: [...options.queryKey, grading.id] }),
  );
  if (view.state === 'loading') return <PageSkeleton rows={2} />;
  if (view.state === 'error') return <ErrorBlock error={view.error} compact />;
  return (
    <pre
      className={classes.pre}
      aria-label={`${t('Log')} ${grading.stage}`}
      tabIndex={0}
    >
      {view.data}
    </pre>
  );
}

/**
 * What one stage's grading holds for the contestant: its verdict, and the
 * summary, the metrics, the tests and the log where the task shows them. The
 * route leaves out what the task withholds, so what is missing is simply not
 * shown, with nothing in its place.
 */
function Stage({
  where,
  grading,
  named,
}: {
  where: Where;
  grading: GradingResult;
  named: boolean;
}) {
  const summary = grading.summary ?? '';
  return (
    <section className={shared.stack} aria-label={`${t('Stage')} ${grading.stage}`}>
      {named && <SectionTitle order={3}>{grading.stage}</SectionTitle>}
      <div className={classes.verdict}>
        <VerdictBadge verdict={verdictOf(grading)} />
        {grading.attempt > 1 && (
          <BodyText tone="secondary">
            {t('Attempt')} {grading.attempt}
          </BodyText>
        )}
      </div>
      {summary !== '' && (
        <pre
          className={classes.pre}
          aria-label={`${t('Summary')} ${grading.stage}`}
          tabIndex={0}
        >
          {summary}
        </pre>
      )}
      <Metrics metrics={grading.metrics} stage={grading.stage} />
      <Tests grading={grading} />
      {grading.log && <Log where={where} grading={grading} />}
    </section>
  );
}

/**
 * One of the caller's submissions, opened from the list: when it was made and
 * its grading at each stage, read again every two seconds while any is still
 * to finish. `onRestore`, when given, offers to put its files back into the
 * panel.
 */
export function SubmissionDetail({
  org,
  contest,
  task,
  number,
  closeTo,
  onRestore,
  restoring,
}: Where & {
  /** Where closing it goes: the task page without the submission open. */
  closeTo: string;
  onRestore?: (number: number) => void;
  restoring: boolean;
}) {
  const view = queryView(
    $api.useQuery(
      'get',
      '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}/submissions/{number}',
      { params: { path: { org, contest, task, number } } },
      { refetchInterval: (query) => pollEvery(query.state.data) },
    ),
  );
  const where = { org, contest, task, number };

  return (
    <section className={shared.stack} aria-label={`${t('Submission')} ${number}`}>
      <div className={classes.heading}>
        <SectionTitle>
          {t('Submission')} #{number}
        </SectionTitle>
        <PageLink to={closeTo}>{t('Close')}</PageLink>
      </div>
      {view.state === 'loading' && <PageSkeleton rows={3} />}
      {view.state === 'error' && <ErrorBlock error={view.error} onRetry={view.retry} />}
      {view.state === 'ready' && (
        <>
          <div className={classes.heading}>
            <BodyText tone="secondary">
              {t('Submitted')} {formatDateTime(new Date(view.data.submitted_at))}
            </BodyText>
            {onRestore !== undefined && (
              <Button
                size="xs"
                variant="secondary"
                label={`${t('Restore the files of submission')} ${number}`}
                loading={restoring}
                onClick={() => onRestore(number)}
              >
                {t('Restore')}
              </Button>
            )}
          </div>
          {view.data.gradings.length === 0 && (
            <BodyText tone="secondary">{t('Not graded on submit')}</BodyText>
          )}
          {view.data.gradings.map((grading) => (
            <Stage
              key={grading.id}
              where={where}
              grading={grading}
              named={view.data.gradings.length > 1}
            />
          ))}
        </>
      )}
    </section>
  );
}
