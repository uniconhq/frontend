import type { Me } from '@/api/types';
import { ListCard } from '@/ui/ListCard';
import { Page, PageHeader } from '@/ui/Page';
import { useMe } from '@/session';
import { orgPath } from '@/lib/organiser-paths';
import { CreateButton } from '../Create';
import { orgsReached, ROLE_LABEL } from '../roles';
import { NEW_ORG, useCreateOrg } from './new-org';

/**
 * What a person organises at an org: their role at the org itself, or where
 * below it they hold one, such as "Manager of spring".
 */
function rolesAt(roles: Me['roles'], org: string): string {
  const held = roles.filter(({ names }) => names.org === org);
  const atOrg = held.find(({ names }) => names.contest === null);
  if (atOrg !== undefined) return `${ROLE_LABEL[atOrg.role]} of the org`;
  return held
    .map(({ names, role }) =>
      names.task === null
        ? `${ROLE_LABEL[role]} of ${names.contest ?? ''}`
        : `${ROLE_LABEL[role]} of ${names.task}, in ${names.contest ?? ''}`,
    )
    .join('; ');
}

/** The orgs page's one button, which opens the new org's form over the list. */
function NewOrg() {
  const { create, submit } = useCreateOrg();
  return (
    <CreateButton
      openLabel="New org"
      intro={NEW_ORG.intro}
      second={NEW_ORG.second}
      submitLabel="Create org"
      pending={create.isPending}
      error={create.error}
      onOpen={create.reset}
      onSubmit={submit}
    />
  );
}

/**
 * The orgs this person holds a role at, read from the roles the session
 * already has, each with what they do there. A role at one contest or task
 * counts, since that is reached through its org. The session is loaded, or
 * failed, before this page renders, so the guard above it owns those two
 * states.
 */
export function OrgsPage() {
  const roles = useMe().roles;
  const orgs = orgsReached(roles);

  return (
    <Page>
      <PageHeader title="Orgs" />
      <ListCard
        title="Your orgs"
        rows={orgs.map((org) => ({
          key: org,
          to: orgPath(org),
          name: org,
          detail: rolesAt(roles, org),
          text: org,
        }))}
        empty="You do not hold a role at any org yet."
        action={<NewOrg />}
      />
    </Page>
  );
}
