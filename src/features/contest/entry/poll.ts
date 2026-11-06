import type { MyEntry } from '@/api/types';

// Poll faster while the caller waits on an organiser or an invite.
const WAITING_MS = 10_000;
const MEANWHILE_MS = 60_000;

export function entryPollEvery(entry: MyEntry | undefined): number {
  if (entry === undefined) return MEANWHILE_MS;
  const waiting =
    entry.entrant?.status === 'pending' ||
    entry.invitations.length > 0 ||
    (entry.entrant?.invites.length ?? 0) > 0;
  return waiting ? WAITING_MS : MEANWHILE_MS;
}
