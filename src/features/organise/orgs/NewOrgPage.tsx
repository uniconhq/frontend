import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { $api } from '@/api/query';
import { orgPath } from '@/lib/organiser-paths';
import { Card } from '@/ui/Card';
import { BodyText } from '@/ui/BodyText';
import { PageTitle } from '@/ui/PageTitle';
import { Create } from '../Create';
import classes from '../organise.module.css';

/** The most an org's description holds: the forge takes no more. */
const DESCRIPTION_MAX = 255;

/**
 * Makes an org and goes to its page. The org, its teams, its event push and
 * its service account are made before the create answers, which takes a few
 * seconds, so the button stays busy until then. The person who asked becomes
 * its first admin, so their roles are read again before the org's page needs
 * them.
 */
export function NewOrgPage() {
  const create = $api.useMutation('post', '/api/v1/orgs');
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return (
    <div className={classes.page}>
      <PageTitle>New org</PageTitle>
      <Card>
        <div className={classes.stack}>
          <BodyText size="md">
            An org holds contests and the people who run them. You become its first
            admin.
          </BodyText>
          <Create
            openLabel="New org"
            title="The org"
            second={{
              label: 'Description',
              description: `Optional, at most ${String(DESCRIPTION_MAX)} characters.`,
              maxLength: DESCRIPTION_MAX,
            }}
            submitLabel="Create org"
            startOpen
            pending={create.isPending}
            error={create.error}
            onSubmit={async (name, description) => {
              const made = await create.mutateAsync({ body: { name, description } });
              await queryClient.invalidateQueries({
                queryKey: $api.queryOptions('get', '/api/v1/me').queryKey,
              });
              await navigate(orgPath(made.name));
            }}
          />
        </div>
      </Card>
    </div>
  );
}
