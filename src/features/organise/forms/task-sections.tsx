import type { Place } from '../files/place';
import { OpenSection } from './sections';
import { StatementEditor } from './StatementEditor';
import { TaskSettings } from './TaskSettings';

export function TaskSettingsSection({ place }: { place: Place }) {
  return (
    <OpenSection title="Settings" place={place} openLabel={() => 'Edit the settings'}>
      {(admin) => <TaskSettings place={place} admin={admin} />}
    </OpenSection>
  );
}

export function StatementSection({ place }: { place: Place }) {
  return (
    <OpenSection
      title="Statement"
      place={place}
      openLabel={(admin) => (admin ? 'Edit the statement' : 'Read the statement')}
    >
      {(admin) => <StatementEditor place={place} admin={admin} />}
    </OpenSection>
  );
}
