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
 * From the contest's own read, which tells it even while its settings do
 * not read, or a task's state; undefined until read, and nothing allowed
 * if the read failed.
 */
function usePlaceRead(place: Place, enabled: boolean): PlaceMay | undefined {
  const task = place.kind === 'task' ? place.task : '';
  const contest = $api.useQuery(
    'get',
    '/api/v1/orgs/{org}/contests/{contest}',
    { params: { path: { org: place.org, contest: place.contest } } },
    { enabled: enabled && place.kind === 'contest' },
  );
  const state = $api.useQuery(
    'get',
    '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}',
    { params: { path: { org: place.org, contest: place.contest, task } } },
    { enabled: enabled && place.kind === 'task' },
  );
  const read = place.kind === 'task' ? state : contest;
  return read.isError ? NOTHING_AT_PLACE : read.data?.may;
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
