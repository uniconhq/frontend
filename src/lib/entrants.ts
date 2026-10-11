import type { EntrantMember, EntrantStatus, MyEntry } from '@/api/types';

/**
 * The words for entrants, the one kind of entry a contest has: one person,
 * or a team of several. A contest whose entrants hold more than one person
 * says "team" to its contestants; one where everyone enters alone says
 * nothing of teams at all.
 */

/** Whether a contest's entrants may hold more than one person. */
export function inTeams(sizes: Pick<MyEntry, 'most'>): boolean {
  return sizes.most > 1;
}

/** How a member came in: by an invite, by a sign-up (named when it has one), or put there by an organiser. */
export function wayText(member: Pick<EntrantMember, 'way_kind' | 'way_name'>): string {
  switch (member.way_kind) {
    case 'invite':
      return 'Invited';
    case 'signup':
      return member.way_name === null ? 'Signed up' : `Signed up: ${member.way_name}`;
    case 'organiser':
      return 'Put in by an organiser';
  }
}

/** How many people a team holds, as a sentence: "A team has 2 or 3 people." */
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

/**
 * When a team stops changing, as a sentence for its members: until then any
 * member invites others, renames it or leaves it.
 */
export function lockSentence(locks: MyEntry['locks'], locked: boolean): string {
  if (locked) return 'Your team is fixed now: only the organisers change who is in it.';
  return locks === 'start'
    ? 'Until the contest starts, any member may invite others, rename the team or leave it. From the start, the team is fixed.'
    : 'Until your team first submits, any member may invite others, rename the team or leave it. From that submission, the team is fixed.';
}

/** Where an entrant's registration stands, as organisers read it. */
export const STATUS_WORD: Record<EntrantStatus, string> = {
  pending: 'Waiting for approval',
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  removed: 'Removed',
};

/** Whose name a member goes by, or that their account is gone. */
export function memberName(member: Pick<EntrantMember, 'user'>): string {
  return member.user?.username ?? 'Deleted account';
}
