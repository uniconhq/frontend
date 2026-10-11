import { useQuery } from '@tanstack/react-query';
import { $api, queryView, type QueryView } from '@/api/query';
import type { WorkflowForm } from '@/api/types';
import { BodyText } from '@/ui/BodyText';
import { useLiveConnected } from '@/live';
import { formatSize } from '@/lib/size';
import { treeQuery } from '../files/place';
import { readAgainIn } from '../gradings/feed';
import { count } from '../hub/count';
import { AnnouncementsLine, FilesLine, Line } from '../hub/lines';
import { announcementsQuery } from '../threads/announcements';
import { publishedLine } from './published';

type TaskPath = { org: string; contest: string; task: string };

const TASK = '/api/v1/orgs/{org}/contests/{contest}/tasks/{task}';

/** The inputs and test fields the task's workflow declares, read for its cards. */
function useWorkflowForm(path: TaskPath): QueryView<WorkflowForm> {
  return queryView(
    $api.useQuery(
      'get',
      `${TASK}/workflow-form`,
      { params: { path } },
      { retry: false },
    ),
  );
}

/** Which workflow grades the task, and whether a newer version is out. */
export function WorkflowCard({ path }: { path: TaskPath }) {
  return (
    <Line
      view={useWorkflowForm(path)}
      say={(form) =>
        form.workflow === null
          ? 'No workflow is named yet.'
          : form.problem !== null
            ? `${form.workflow} cannot be read: ${form.problem}`
            : form.newer !== null
              ? `Graded by ${form.workflow}. Version ${form.newer} is out.`
              : `Graded by ${form.workflow}.`
      }
    />
  );
}

/** How many of the workflow's inputs the contestant gives, and how many the task sets. */
export function InputsCard({ path }: { path: TaskPath }) {
  return (
    <Line
      view={useWorkflowForm(path)}
      say={(form) => {
        if (form.problem !== null || form.workflow === null) {
          return 'Known once the workflow can be read.';
        }
        const contestant = form.inputs.filter((input) => input.contestant).length;
        const task = form.inputs.length - contestant;
        return `${count(contestant, 'input', 'inputs')} the contestant gives, ${String(task)} the task sets.`;
      }}
    />
  );
}

/** The test groups, one per folder of tests. */
export function TestsCard({ path }: { path: TaskPath }) {
  const view = queryView(
    useQuery({ ...treeQuery({ kind: 'task', ...path }, 'tests'), retry: false }),
  );
  return (
    <Line
      view={view}
      say={(entries) => {
        const groups = entries.filter((entry) => entry.kind === 'directory');
        return groups.length === 0
          ? 'No tests yet. Upload them in Files.'
          : `${count(groups.length, 'test group', 'test groups')}: ${groups
              .map((group) => group.path.slice('tests/'.length))
              .join(', ')}.`;
      }}
    />
  );
}

/** Whether the statement is written. */
export function StatementCard({ path }: { path: TaskPath }) {
  const view = queryView(useQuery(treeQuery({ kind: 'task', ...path }, '')));
  return (
    <Line
      view={view}
      say={(entries) => {
        const statement = entries.find((entry) => entry.path === 'statement.md');
        return statement === undefined
          ? 'Not written yet.'
          : statement.size === null
            ? 'Written.'
            : `Written, ${formatSize(statement.size)}.`;
      }}
    />
  );
}

/** How many gradings there are, and how many still run. */
export function GradingsCard({ path }: { path: TaskPath }) {
  const live = useLiveConnected();
  const view = queryView(
    $api.useQuery(
      'get',
      `${TASK}/gradings`,
      { params: { path } },
      { refetchInterval: (query) => readAgainIn(live, query.state.data) },
    ),
  );
  return (
    <Line
      view={view}
      say={(gradings) => {
        if (gradings.length === 0) return 'Nothing has been graded yet.';
        const running = gradings.filter((entry) =>
          ['queued', 'dispatched', 'running'].includes(entry.grading.status),
        ).length;
        return running === 0
          ? `${count(gradings.length, 'grading', 'gradings')}, none still running.`
          : `${count(gradings.length, 'grading', 'gradings')}, ${String(running)} still running.`;
      }}
    />
  );
}

export function PublicationsCard({ path }: { path: TaskPath }) {
  const view = queryView($api.useQuery('get', TASK, { params: { path } }));
  return <Line view={view} say={(state) => publishedLine(state.latest)} />;
}

export function AnnouncementsCard({ path }: { path: TaskPath }) {
  return (
    <AnnouncementsLine
      view={queryView(useQuery(announcementsQuery({ kind: 'task', ...path })))}
    />
  );
}

export function FilesCard({ path }: { path: TaskPath }) {
  return (
    <FilesLine view={queryView(useQuery(treeQuery({ kind: 'task', ...path }, '')))} />
  );
}

export function SettingsCard() {
  return <BodyText>Name, workflow, inputs, scoring and submission limits.</BodyText>;
}
