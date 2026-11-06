import { ReadOnly } from '@/ui/ReadOnly';
import { contestSectionPath, orgSectionPath, taskSectionPath } from '@/lib/sections';
import type { RolePlace } from './roles';

/** The read-only note, with where to find who can change things, unless `allowed`. */
export function ReadOnlyAt({ place, allowed }: { place: RolePlace; allowed: boolean }) {
  const to =
    place.kind === 'task'
      ? taskSectionPath(place.org, place.contest, place.task, 'organisers')
      : place.kind === 'contest'
        ? contestSectionPath(place.org, place.contest, 'organisers')
        : orgSectionPath(place.org, 'organisers');
  return allowed ? null : (
    <ReadOnly
      to={to}
      organisers={`${place.kind === 'task' ? 'Task' : place.kind === 'contest' ? 'Contest' : 'Org'} organisers`}
    />
  );
}
