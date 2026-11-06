import { BodyText } from '@/ui/BodyText';
import { HubCard } from '@/ui/HubCard';
import { Loaded } from '@/ui/feedback/Loaded';
import { contestSectionPath } from '@/lib/sections';
import { formatDateTime } from '@/lib/time';
import { registrationSentence } from '../forms/ways';
import { teamsSentence } from './words';
import { useContestSettings } from './settings';
import classes from './contest.module.css';

/** The form holds this time in the organiser's own zone. */
function when(local: string): string {
  return local === '' ? 'Not set' : formatDateTime(new Date(local));
}

/** Who sees the contest is on its Status card. */
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
                <dt>Schedule</dt>
                <dd>
                  {when(values.start)} to {when(values.end)}
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
