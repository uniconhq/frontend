import type { Invite } from '@/api/types';

/**
 * An invite as the backend answers one: pending, to the manager role at the
 * acme org, for eve by username, sent by kenny and mailed, until a test says
 * otherwise.
 */
export function invite(overrides: Partial<Invite> = {}): Invite {
  return {
    id: '0b6c3c1e-1d2f-4a5b-8c9d-0e1f2a3b4c5d',
    where: { org: 'acme', contest: null, task: null },
    grants: 'manager',
    username: 'eve',
    email: null,
    invited_by: { id: 7, username: 'kenny', name: 'Kenny Lewi', avatar_url: null },
    status: 'pending',
    expired: false,
    created_at: '2026-09-10T10:00:00Z',
    expires_at: '2026-09-24T10:00:00Z',
    decided_at: null,
    mail_status: 'sent',
    mailed_at: '2026-09-10T10:00:05Z',
    ...overrides,
  };
}
