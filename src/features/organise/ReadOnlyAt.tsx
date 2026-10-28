import type { RoleName } from '@/api/types';
import { useMe } from '@/session';
import { ReadOnly } from '@/ui/ReadOnly';
import { contestSectionPath, orgSectionPath, taskSectionPath } from '@/lib/sections';
import { holdsAt, type RolePlace } from './roles';

export function ReadOnlyAt({
  place,
  role = 'manager',
}: {
  place: RolePlace;
  role?: RoleName;
}) {
  const allowed = holdsAt(useMe().roles, place, role);
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
