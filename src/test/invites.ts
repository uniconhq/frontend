import type { Invite } from '@/api/types';

/**
 * An invite as the backend answers one: pending, to the manager role at the
 * acme org, for eve by username, sent by kenny and mailed, until a test says
 * otherwise; an invite at a contest carries its title, Spring 2026.
 */
export function invite(overrides: Partial<Invite> = {}): Invite {
  const where = overrides.where ?? { org: 'acme', contest: null, task: null };
  return {
    id: '0b6c3c1e-1d2f-4a5b-8c9d-0e1f2a3b4c5d',
    where,
    grants: 'manager',
    username: 'eve',
    email: null,
    entrant: null,
    invited_by: { id: 7, username: 'kenny', name: 'Kenny Lewi', avatar_url: null },
    status: 'pending',
    expired: false,
    created_at: '2026-09-10T10:00:00Z',
    expires_at: '2026-09-24T10:00:00Z',
    decided_at: null,
    // As the backend gives it: the contest's title, null at an org.
    contest_title: where.contest === null ? null : 'Spring 2026',
    mail_status: 'sent',
    mailed_at: '2026-09-10T10:00:05Z',
    ...overrides,
  };
}
