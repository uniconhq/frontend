import { $api } from '@/api/query';
import type { OrgMay, PlaceMay } from '@/api/types';
import type { RolePlace } from './roles';

/** What a page shows before the server has said: nothing to do. */
const NOTHING_AT_ORG: OrgMay = {
  edit: false,
  create_contest: false,
  see_people: false,
  manage_people: false,
  give_admin: false,
};
const NOTHING_AT_PLACE: PlaceMay = {
  manage: false,
  edit_admin_settings: false,
  locked_keys: [],
  see_people: false,
  manage_people: false,
  give_admin: false,
};

type Place = Exclude<RolePlace, { kind: 'org' }>;

function useOrgRead(org: string, enabled: boolean): OrgMay | undefined {
  const read = $api.useQuery(
    'get',
    '/api/v1/orgs/{org}',
    { params: { path: { org } } },
    { enabled },
  );
  return read.isError ? NOTHING_AT_ORG : read.data?.may;
}

/**
 * From the org's list of contests, which tells it even while the contest's
 * settings do not read, or a task's state; undefined until read, and
 * nothing allowed if the read failed.
 */
function usePlaceRead(place: Place, enabled: boolean): PlaceMay | undefined {
  const task = place.kind === 'task' ? place.task : '';
  const listed = $api.useQuery(
    'get',
    '/api/v1/orgs/{org}/contests',
    { params: { path: { org: place.org } } },
    { enabled: enabled && place.kind === 'contest' },
  );
  const state = $api.useQuery(
    'get',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}',
    { params: { path: { org: place.org, contest: place.contest, task } } },
    { enabled: enabled && place.kind === 'task' },
  );
  const read = place.kind === 'task' ? state : listed;
  if (read.isError) return NOTHING_AT_PLACE;
  if (place.kind === 'task') return state.data?.may;
  if (listed.data === undefined) return undefined;
  return (
    listed.data.find((contest) => contest.name === place.contest)?.may ??
    NOTHING_AT_PLACE
  );
}

/** What the server says the caller may do at the org. */
export function useOrgMay(org: string): OrgMay {
  return useOrgRead(org, true) ?? NOTHING_AT_ORG;
}

/** What the server says the caller may do at a contest or a task. */
export function usePlaceMay(place: Place): PlaceMay {
  return usePlaceRead(place, true) ?? NOTHING_AT_PLACE;
}

/** The same, undefined until the server has said, for a form to wait on. */
export function usePlaceMayRead(place: Place): PlaceMay | undefined {
  return usePlaceRead(place, true);
}

export type PeopleMay = Pick<OrgMay, 'see_people' | 'manage_people' | 'give_admin'>;

/**
 * What the caller may do about the organisers of an org, a contest or a
 * task; undefined until the server has said.
 */
export function usePeopleMay(place: RolePlace): PeopleMay | undefined {
  const atOrg = useOrgRead(place.org, place.kind === 'org');
  const atPlace = usePlaceRead(
    place.kind === 'org' ? { kind: 'contest', org: place.org, contest: '' } : place,
    place.kind !== 'org',
  );
  return place.kind === 'org' ? atOrg : atPlace;
}
