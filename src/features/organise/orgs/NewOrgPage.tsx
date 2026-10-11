import { Card } from '@/ui/Card';
import { Page, PageHeader } from '@/ui/Page';
import { CreateForm } from '../CreateForm';
import { NEW_ORG, useCreateOrg } from './new-org';

/**
 * The new org's form at an address of its own, for a link straight to it;
 * the orgs page opens the same form from its New org button.
 */
export function NewOrgPage() {
  const { create, submit } = useCreateOrg();
  return (
    <Page>
      <PageHeader title="New org" />
      <Card>
        <CreateForm
          title="New org"
          intro={NEW_ORG.intro}
          second={NEW_ORG.second}
          submitLabel="Create org"
          pending={create.isPending}
          error={create.error}
          onSubmit={submit}
        />
      </Card>
    </Page>
  );
}
