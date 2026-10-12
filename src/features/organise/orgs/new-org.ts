import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { $api } from '@/api/query';
import { orgPath } from '@/lib/organiser-paths';
import type { SecondField } from '../CreateForm';

/** The most an org's description holds: the forge takes no more. */
const DESCRIPTION_MAX = 255;

/** What the new org's form says above its fields, and its second field. */
export const NEW_ORG = {
  intro:
    'An org holds contests and the people who run them. You become its first admin.',
  second: {
    label: 'Description',
    description: `Optional, at most ${String(DESCRIPTION_MAX)} characters.`,
    maxLength: DESCRIPTION_MAX,
  } satisfies SecondField,
};

/**
 * Makes an org and opens its page. The org, its teams, its event push and
 * its service account are made before the create answers, which takes a few
 * seconds, so the button stays busy until then. The person who asked becomes
 * its first admin, so their roles are read again before the org's page needs
 * them.
 */
export function useCreateOrg() {
  const queryClient = useQueryClient();
  const create = $api.useMutation('post', '/api/v1/orgs', {
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: $api.queryOptions('get', '/api/v1/me').queryKey,
      }),
  });
  const navigate = useNavigate();
  const submit = async (name: string, description: string) => {
    const made = await create.mutateAsync({ body: { name, description } });
    await navigate(orgPath(made.name));
  };
  return { create, submit };
}
