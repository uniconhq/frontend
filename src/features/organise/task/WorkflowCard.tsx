import { queryView } from '@/api/query';
import { BodyText } from '@/ui/BodyText';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { PageLink } from '@/ui/PageLink';
import { Loaded } from '@/ui/feedback/Loaded';
import { workflowPath } from '@/lib/organiser-paths';
import { FieldBox } from '../contest/ContestFile';
import { VersionGraph } from '../workflows/VersionGraph';
import { BuildCard } from './BuildCard';
import { WorkflowPicker } from './WorkflowPicker';
import {
  refParts,
  usePrimitives,
  useWorkflowList,
  useWorkflowVersion,
} from './build-data';
import shared from '../organise.module.css';

/** The workflow named, as the chip shows it, linking to its page at that version. */
function WorkflowChip({ workflow }: { workflow: string }) {
  const parts = refParts(workflow);
  if (parts === null) return <Chip>{workflow}</Chip>;
  return (
    <PageLink
      to={workflowPath(parts.owner, parts.name, parts.version)}
      label={`Open ${workflow}`}
    >
      <Chip>{workflow}</Chip>
    </PageLink>
  );
}

/**
 * The steps of the chosen version, drawn read-only as its own page draws
 * them: a box clicked opens with its drawer, Files lists the version's
 * files, and the switch shows the inputs and files the steps read.
 */
function Steps({ workflow }: { workflow: string }) {
  const version = queryView(useWorkflowVersion(workflow));
  const primitives = queryView(usePrimitives());
  const parts = refParts(workflow);
  if (version.state === 'error') {
    return (
      <BodyText tone="secondary">
        Its steps cannot be shown: {version.error.detail ?? version.error.title}
      </BodyText>
    );
  }
  if (parts === null) return null;
  return (
    <Loaded view={version} rows={4}>
      {(read) => (
        <Loaded view={primitives} rows={4}>
          {(list) => (
            <VersionGraph
              {...parts}
              text={read.content}
              primitives={list}
              bar={(tools) => <div className={shared.actions}>{tools}</div>}
            />
          )}
        </Loaded>
      )}
    </Loaded>
  );
}

/**
 * The Workflow card: which workflow grades the task, as a chip that opens its
 * page; a newer version when there is one, to take with one click; the
 * picker of workflows and versions; and the chosen version's steps, drawn.
 * Choosing here changes the task's other cards to the chosen workflow's
 * inputs at once, and is saved with them, by the one save bar.
 */
export function WorkflowCard({
  saved,
  newer,
  problem,
  value,
  onChange,
  disabled,
}: {
  /** The workflow the task's last save names, or null when none. */
  saved: string | null;
  /** The workflow's newest version, when it comes after the one saved. */
  newer: string | null;
  /** Why the saved workflow cannot be read, when it cannot. */
  problem: string | null;
  value: string;
  onChange: (ref: string) => void;
  disabled: boolean;
}) {
  const list = queryView(useWorkflowList());
  const parts = refParts(saved ?? '');
  const newerRef =
    parts === null || newer === null ? null : `${parts.owner}/${parts.name}@${newer}`;
  const chosen = value.trim();
  return (
    <BuildCard
      id="workflow"
      title="Workflow"
      line="How every submission is graded. Choose a workflow, and the cards below ask for what it needs."
      aside={saved !== null ? <WorkflowChip workflow={saved} /> : undefined}
    >
      {saved === null && chosen === '' && (
        <BodyText>
          No workflow is chosen yet. Choose one to say how the task grades.
        </BodyText>
      )}
      {problem !== null && <BodyText>{problem}</BodyText>}
      {newerRef !== null && (
        <div className={shared.actions} role="status" aria-label="A newer version">
          <Chip tone="warn">{newer} available</Chip>
          <BodyText tone="secondary">
            The task grades with {saved} until {newerRef} is chosen and saved.
          </BodyText>
          {chosen !== newerRef && !disabled && (
            <Button size="xs" variant="secondary" onClick={() => onChange(newerRef)}>
              Use {newer}
            </Button>
          )}
        </div>
      )}
      <FieldBox name="workflow">
        <Loaded view={list} rows={1}>
          {(items) => (
            <WorkflowPicker
              value={chosen}
              items={items}
              onChange={onChange}
              disabled={disabled}
            />
          )}
        </Loaded>
      </FieldBox>
      {saved !== null && chosen !== saved && chosen !== '' && (
        <BodyText tone="secondary">
          Saving changes the task from {saved} to {chosen}. The other cards show what{' '}
          {chosen} asks for.
        </BodyText>
      )}
      {refParts(chosen) !== null && <Steps workflow={chosen} />}
    </BuildCard>
  );
}
