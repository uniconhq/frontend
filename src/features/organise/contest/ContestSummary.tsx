import { BodyText } from '@/ui/BodyText';
import { HubCard } from '@/ui/HubCard';
import { Loaded } from '@/ui/feedback/Loaded';
import { contestSectionPath } from '@/lib/sections';
import { formatDateTime } from '@/lib/time';
import type { ContestValues } from '../forms/contest-values';
import { useContestSettings } from './settings';
import classes from './contest.module.css';

const VISIBILITY: Record<string, string> = {
  everyone: 'Anyone, signed in or not',
  'signed-in': 'Anyone signed in',
  hidden: 'Only its contestants and organisers',
};

/** A time the form holds in the organiser's own zone, as a date and time. */
function when(local: string): string {
  return local === '' ? 'Not set' : formatDateTime(new Date(local));
}

function registration(values: ContestValues): string {
  const how = values.inviteOnly
    ? 'By invitation only'
    : values.code !== ''
      ? 'Anyone with the code'
      : 'Anyone may register';
  const approval =
    values.approval === 'auto'
      ? 'approved straight away'
      : 'an organiser approves each';
  return `${how}, ${approval}`;
}

function teams(values: ContestValues): string {
  return values.teamSize === '' || values.teamSize === '1'
    ? 'Everyone enters alone'
    : `Teams of up to ${values.teamSize}`;
}

/**
 * The contest's settings at a glance, at the top of its page: when it runs,
 * who sees it, how people enter and whether in teams. The card goes to the
 * settings page, where they are changed.
 */
export function ContestSummary({ org, contest }: { org: string; contest: string }) {
  const view = useContestSettings(org, contest);
  return (
    <HubCard title="Settings" to={contestSectionPath(org, contest, 'settings')}>
      <Loaded view={view} compact>
        {(values) =>
          values === null ? (
            <BodyText>The settings cannot be read. Open them to mend them.</BodyText>
          ) : (
            <dl className={classes.summary} aria-label="The settings">
              <div>
                <dt>Runs</dt>
                <dd>
                  {when(values.start)} to {when(values.end)}
                </dd>
              </div>
              <div>
                <dt>Who sees it</dt>
                <dd>{VISIBILITY[values.visibility] ?? 'Not set'}</dd>
              </div>
              <div>
                <dt>Registration</dt>
                <dd>{registration(values)}</dd>
              </div>
              <div>
                <dt>Teams</dt>
                <dd>{teams(values)}</dd>
              </div>
            </dl>
          )
        }
      </Loaded>
    </HubCard>
  );
}
