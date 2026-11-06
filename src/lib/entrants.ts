import type { EntrantMember, EntrantStatus, MyEntry } from '@/api/types';

/** A contest says "team" only when an entrant may hold more than one person. */
export function inTeams(sizes: Pick<MyEntry, 'most'>): boolean {
  return sizes.most > 1;
}

export function wayText(member: Pick<EntrantMember, 'way_kind' | 'way_name'>): string {
  switch (member.way_kind) {
    case 'invite':
      return 'Invited';
    case 'signup':
      return member.way_name === null ? 'Signed up' : `Signed up: ${member.way_name}`;
    case 'organiser':
      return 'Added by an organiser';
  }
}

export function sizeSentence({
  most,
  fewest,
}: Pick<MyEntry, 'most' | 'fewest'>): string {
  if (most <= 1) return 'Everyone enters alone.';
  if (fewest === most) return `A team has exactly ${String(most)} people.`;
  if (fewest <= 1)
    return `A team has up to ${String(most)} people, and one person may enter alone.`;
  return `A team has ${String(fewest)} to ${String(most)} people.`;
}

export function lockSentence(locks: MyEntry['locks'], locked: boolean): string {
  if (locked)
    return 'Your team is fixed now: only the organisers can change who is in it.';
  return locks === 'start'
    ? 'Until the contest starts, any member may invite others, rename the team or leave it. From the start, the team is fixed.'
    : 'Until your team first submits, any member may invite others, rename the team or leave it. From that submission, the team is fixed.';
}

export const STATUS_WORD: Record<EntrantStatus, string> = {
  pending: 'Waiting for approval',
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  removed: 'Removed',
};

export function memberName(member: Pick<EntrantMember, 'user'>): string {
  return member.user?.username ?? 'Deleted account';
}
