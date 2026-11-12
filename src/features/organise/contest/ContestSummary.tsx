import { BodyText } from '@/ui/BodyText';
import { HubCard } from '@/ui/HubCard';
import { Loaded } from '@/ui/feedback/Loaded';
import { contestSectionPath } from '@/lib/sections';
import { formatDateTime } from '@/lib/time';
import { registrationSentence } from '../forms/ways';
import { VISIBILITY_CHOICES, teamsSentence } from './words';
import { useContestSettings } from './settings';
import { Summary } from '../hub/Status';

/** The form holds this time in the organiser's own zone. */
function when(local: string): string {
  return local === '' ? 'Not set' : formatDateTime(new Date(local));
}

export function ContestSummary({ org, contest }: { org: string; contest: string }) {
  const view = useContestSettings(org, contest);
  return (
    <HubCard title="Settings" to={contestSectionPath(org, contest, 'settings')}>
      <Loaded view={view} compact>
        {(values) =>
          values === null ? (
            <BodyText>The settings cannot be read. Open them to fix them.</BodyText>
          ) : (
            <Summary
              label="The settings"
              items={[
                {
                  term: 'Schedule',
                  value: `${when(values.start)} to ${when(values.end)}`,
                },
                { term: 'How people enter', value: registrationSentence(values) },
                { term: 'Teams', value: teamsSentence(values) },
                {
                  term: 'Who sees it',
                  value:
                    VISIBILITY_CHOICES.find((one) => one.value === values.visibility)
                      ?.label ?? 'Not set',
                },
              ]}
            />
          )
        }
      </Loaded>
    </HubCard>
  );
}
