import type { Provisioning } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { PageLink } from '@/ui/PageLink';
import { SectionTitle } from '@/ui/SectionTitle';
import { t } from '@/lib/t';
import { formatTimeOfDay, serverNow } from '@/lib/time';
import { progressOf, type StepState } from './steps';
import shared from '../organise.module.css';
import classes from './Provisioning.module.css';

const STATUS: Record<Provisioning['status'], string> = {
  pending: 'Waiting to start.',
  running: 'Working on it.',
  ready: 'Ready.',
  failed: 'Stopped.',
};

const STATE: Record<StepState, string> = {
  done: 'done',
  working: 'working',
  failed: 'failed',
  waiting: 'waiting',
};

/** forge's reasons are lowercase clauses; shown alone they read as a sentence. */
function sentence(text: string): string {
  const trimmed = text.trim().replace(/\.$/, '');
  return trimmed.length === 0
    ? ''
    : `${trimmed[0]?.toUpperCase() ?? ''}${trimmed.slice(1)}.`;
}

/**
 * When a failed record is tried again, read against the server's clock, since
 * `retry_at` is the server's time: a time still to come shows as a time of
 * day, and one already passed as now.
 */
function retryWhen(retryAt: string | null): string {
  if (retryAt === null) {
    return t(
      'It is tried again on its own, without repeating the steps that finished.',
    );
  }
  const due = new Date(retryAt);
  if (due.getTime() <= serverNow().getTime()) {
    return t('It is being tried again now, without repeating the steps that finished.');
  }
  return `${t('It is tried again on its own at')} ${formatTimeOfDay(due)}, ${t(
    'without repeating the steps that finished.',
  )}`;
}

/**
 * How far making an org, a contest or a task has got, one component for all
 * three. The record says which steps there are and in what order; this shows
 * the status, the step reached, each step as it completes, the attempt count,
 * and on a failure the step it stopped at, why, and when it is tried again.
 * The status line is a live region, so a screen reader hears it move on.
 */
export function ProvisioningProgress({
  record,
  label,
  page,
}: {
  record: Provisioning;
  /** The thing being made, as a phrase: "the org acme". */
  label: string;
  page: string;
}) {
  const progress = progressOf(record);
  const title = `${t('Making')} ${label}`;

  return (
    <section className={classes.progress} aria-label={title}>
      <SectionTitle order={3}>{title}</SectionTitle>
      <div role="status">
        <BodyText>
          {t(STATUS[record.status])}{' '}
          {record.attempts > 0 && `${t('Attempt')} ${String(record.attempts)}.`}
        </BodyText>
      </div>
      {record.status !== 'ready' && (
        <BodyText tone="secondary">
          {progress.reached === null
            ? t('No step has finished yet.')
            : `${t('Reached')}: ${progress.reached}.`}
        </BodyText>
      )}

      {progress.steps.length > 0 && (
        <ol className={classes.steps}>
          {progress.steps.map((step) => (
            <li key={step.name} className={classes.step} data-state={step.state}>
              <span className={classes.state}>{t(STATE[step.state])}</span>
              <span>{step.label}</span>
            </li>
          ))}
        </ol>
      )}

      {progress.failure !== null && (
        <div className={shared.panel} role="alert">
          <BodyText>
            {progress.failure.step === null
              ? t('It stopped outside its steps.')
              : `${t('It stopped at')} ${progress.failure.step}.`}{' '}
            {sentence(progress.failure.reason)}
          </BodyText>
          <BodyText tone="secondary">{retryWhen(record.retry_at)}</BodyText>
        </div>
      )}

      {record.status === 'ready' && (
        <PageLink to={page}>{`${t('Open')} ${label}`}</PageLink>
      )}
    </section>
  );
}
