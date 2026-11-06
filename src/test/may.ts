import type { ListedContest, OrgMay, PlaceMay, RoleName } from '@/api/types';

/**
 * What the fake backend tells a reader they may do, as the forge works it
 * out for each role held at the place; `null` holds none there.
 */
export type Held = RoleName | null;

const CONTEST_LOCKED = ['name', 'description', 'state', 'visibility', 'registration'];
const TASK_LOCKED = ['name', 'submissions'];

const ORG_MAY: Record<RoleName | 'none', OrgMay> = {
  admin: {
    edit: true,
    create_contest: true,
    see_people: true,
    manage_people: true,
    give_admin: true,
  },
  manager: {
    edit: false,
    create_contest: true,
    see_people: true,
    manage_people: true,
    give_admin: false,
  },
  observer: {
    edit: false,
    create_contest: false,
    see_people: true,
    manage_people: false,
    give_admin: false,
  },
  none: {
    edit: false,
    create_contest: false,
    see_people: false,
    manage_people: false,
    give_admin: false,
  },
};

function placeMay(held: Held, locked: string[]): PlaceMay {
  const org = ORG_MAY[held ?? 'none'];
  return {
    manage: org.create_contest,
    edit_admin_settings: org.edit,
    locked_keys: org.edit ? [] : locked,
    see_people: org.see_people,
    manage_people: org.manage_people,
    give_admin: org.give_admin,
  };
}

export const orgMay = (held: Held): OrgMay => ORG_MAY[held ?? 'none'];
const contestMay = (held: Held): PlaceMay => placeMay(held, CONTEST_LOCKED);
export const taskMay = (held: Held): PlaceMay => placeMay(held, TASK_LOCKED);

/** A contest as its own read gives it by default: a draft. */
export function listedContest(name: string, held: Held = 'admin'): ListedContest {
  return {
    name,
    state: 'draft',
    start: '2026-10-01T09:00:00Z',
    end: '2026-10-15T09:00:00Z',
    may: contestMay(held),
  };
}

/** The org's contests as the list gives them by default: spring and autumn, drafts. */
export function listedContests(held: Held = 'admin'): ListedContest[] {
  return ['autumn', 'spring'].map((name) => listedContest(name, held));
}

/** The picture limits the backend gives with a task. */
export const PICTURES = {
  most: 10 * 1024 * 1024,
  endings: ['apng', 'avif', 'bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'webp'],
};

/** A task's state as the fake backend gives it by default. */
export function taskDetail(held: Held = 'admin') {
  return {
    draft: false,
    errors: [],
    head: 'v1',
    head_statement_written: false,
    latest: null,
    statement_written: false,
    toolchains: {},
    results: { released: false, history: [] },
    may: taskMay(held),
    pictures: PICTURES,
  };
}
