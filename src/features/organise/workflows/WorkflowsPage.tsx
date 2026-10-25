import { $api, queryView } from '@/api/query';
import type { WorkflowItem } from '@/api/types';
import { ListCard, type ListRow } from '@/ui/ListCard';
import { Page, PageHeader } from '@/ui/Page';
import { BodyText } from '@/ui/BodyText';
import { Loaded } from '@/ui/feedback/Loaded';
import { workflowPath } from '@/lib/organiser-paths';
import { NewWorkflowButton } from './NewWorkflow';
import { latestVersion } from './versions';
import { visibilityWords } from './words';

function rows(items: WorkflowItem[]): ListRow[] {
  return items.map((item) => {
    const latest = latestVersion(item.versions);
    return {
      key: `${item.owner}/${item.name}`,
      to: workflowPath(item.owner, item.name),
      name: `${item.owner}/${item.name}`,
      detail: `${visibilityWords(item)} · ${latest === undefined ? 'No version yet' : `Latest version ${latest}`}`,
      text: `${item.owner}/${item.name}`,
    };
  });
}

/**
 * Every workflow the person may read: those they may change, with the one
 * way to make a new one (M32), and those shared with them or public, each
 * going to its page.
 */
export function WorkflowsPage() {
  const view = queryView($api.useQuery('get', '/api/v1/workflows'));
  const loading =
    view.state === 'ready' ? undefined : <Loaded view={view}>{() => null}</Loaded>;
  const items = view.state === 'ready' ? view.data : [];
  return (
    <Page>
      <PageHeader title="Workflows">
        <BodyText size="md" tone="secondary">
          A workflow is the steps that grade a submission. Each task chooses a version
          of one.
        </BodyText>
      </PageHeader>
      <ListCard
        title="Workflows you can change"
        rows={rows(items.filter((item) => item.editable))}
        empty="You have no workflow of your own yet."
        action={<NewWorkflowButton />}
        body={loading}
      />
      <ListCard
        title="Workflows you can use"
        rows={rows(items.filter((item) => !item.editable))}
        empty="Nobody has shared a workflow with you, and none is public."
        body={loading}
      />
    </Page>
  );
}
