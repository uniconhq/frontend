import { queryView } from '@/api/query';
import { Loaded } from '@/ui/feedback/Loaded';
import { useWorkflowList } from './build-data';
import type { Kind } from './new-task';
import { WorkflowPicker } from './WorkflowPicker';

/**
 * The workflow a new task starts on. The task is created on the platform's
 * starter, then its first save moves it onto the workflow chosen here.
 */
export function TaskKind({
  value,
  onChange,
}: {
  value: Kind;
  onChange: (kind: Kind) => void;
}) {
  const list = queryView(useWorkflowList());
  return (
    <Loaded view={list} rows={3}>
      {(items) => (
        <WorkflowPicker
          value={value.workflow}
          items={items}
          onChange={(workflow) => onChange({ workflow })}
        />
      )}
    </Loaded>
  );
}
