import type { Provisioning } from '@/api/types';

/**
 * The names a person reads for the step ids the app knows, by kind. The
 * record itself says which steps there are and in what order; this table only
 * puts them in words. A step it does not know shows under its own id.
 */
const LABELS: Record<Provisioning['kind'], Record<string, string>> = {
  org: {
    account_row: "the record for the org's service account",
    org: 'the organization at the forge',
    roles: "the org's teams for each role",
    labels: "the org's discussion labels",
    event_push: 'the event push from the forge to Unicon',
    first_admin: 'you as its first admin',
    service_account: "the org's service account",
    service_token: "the service account's access token",
    ci_user: 'the service account at the CI',
    ci_login: "the service account's sign-in at the CI",
  },
  contest: {
    repo: 'the contest repo with its starter settings',
    roles: "the contest repo's teams and protection",
  },
  task: {
    repo: 'the task repo with its starter files',
    roles: "the task repo's teams and protection",
  },
};

export type StepState = 'done' | 'working' | 'failed' | 'waiting';

export type Progress = {
  steps: { name: string; label: string; state: StepState }[];
  /** The last step that completed, in words, or null before the first. */
  reached: string | null;
  /**
   * When it failed: the step it stopped at, in words, or null when it failed
   * outside any step, and why.
   */
  failure: { step: string | null; reason: string } | null;
};

function labelOf(kind: Provisioning['kind'], name: string): string {
  return LABELS[kind][name] ?? name;
}

export function progressOf(record: Provisioning): Progress {
  const names = record.steps;
  const reachedIndex = record.last_step === null ? -1 : names.indexOf(record.last_step);
  const next = names[reachedIndex + 1] ?? null;
  const failedStep = record.status === 'failed' ? record.failed_step : null;

  const failure: Progress['failure'] =
    record.status === 'failed'
      ? {
          step: failedStep === null ? null : labelOf(record.kind, failedStep),
          reason: record.error ?? '',
        }
      : null;

  const steps = names.map((name, index) => {
    let state: StepState = 'waiting';
    if (record.status === 'ready' || index <= reachedIndex) state = 'done';
    else if (name === failedStep) state = 'failed';
    else if (record.status === 'running' && name === next) state = 'working';
    return { name, label: labelOf(record.kind, name), state };
  });

  return {
    steps,
    reached: record.last_step === null ? null : labelOf(record.kind, record.last_step),
    failure,
  };
}
