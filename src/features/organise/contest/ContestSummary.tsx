import { BodyText } from '@/ui/BodyText';
import { HubCard } from '@/ui/HubCard';
import { Loaded } from '@/ui/feedback/Loaded';
import { contestSectionPath } from '@/lib/sections';
import { formatDateTime } from '@/lib/time';
import { registrationSentence } from '../forms/ways';
import { VISIBILITY_CHOICES, teamsSentence } from './words';
import { useContestSettings } from './settings';
import classes from './contest.module.css';

/** A time the form holds in the organiser's own zone, as a date and time. */
function when(local: string): string {
  return local === '' ? 'Not set' : formatDateTime(new Date(local));
}

/**
 * The contest's settings at a glance, at the top of its page: when it runs,
 * who sees it, how people enter, as one sentence, and whether in teams. The
 * card goes to the settings page, where they are changed.
 */
export function ContestSummary({ org, contest }: { org: string; contest: string }) {
  const view = useContestSettings(org, contest);
  return (
    <HubCard title="Settings" to={contestSectionPath(org, contest, 'settings')}>
      <Loaded view={view} compact>
        {(values) =>
          values === null ? (
            <BodyText>The settings cannot be read. Open them to fix them.</BodyText>
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
                <dd>
                  {VISIBILITY_CHOICES.find((one) => one.value === values.visibility)
                    ?.label ?? 'Not set'}
                </dd>
              </div>
              <div>
                <dt>How people enter</dt>
                <dd>{registrationSentence(values)}</dd>
              </div>
              <div>
                <dt>Teams</dt>
                <dd>{teamsSentence(values)}</dd>
              </div>
            </dl>
          )
        }
      </Loaded>
    </HubCard>
  );
}
