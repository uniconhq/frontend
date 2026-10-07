import type { Place } from '../files/place';
import { OpenSection } from './sections';
import { TaskSettings } from './TaskSettings';

export function TaskSettingsSection({ place }: { place: Place }) {
  return (
    <OpenSection title="Settings" place={place} openLabel={() => 'Edit the settings'}>
      {(admin) => <TaskSettings place={place} admin={admin} />}
    </OpenSection>
  );
}
